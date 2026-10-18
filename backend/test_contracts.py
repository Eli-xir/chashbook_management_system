import unittest
from decimal import Decimal
from unittest.mock import Mock, patch
from uuid import uuid4

from fastapi import HTTPException
from contracts import change_contract, validate_receipt
from models import ContractChange, TransactionChange
from service import transaction_change


class ContractTests(unittest.TestCase):
    def test_shared_remaining_and_edit_exclusion_are_checked_under_lock(self):
        db = Mock()
        db.execute.return_value.fetchone.side_effect = [
            {'is_active': True, 'total_amount': Decimal('1000')}, {'linked': True}, {'amount': Decimal('700')}]
        validate_receipt(db, 'contract', 'payer', Decimal('300'), 42)
        self.assertIn('FOR UPDATE', db.execute.call_args_list[0].args[0])
        self.assertEqual(db.execute.call_args_list[2].args[1], ('contract', 42, 42))

    def test_overpayment_unlinked_archived_and_zero_receipts_are_rejected(self):
        for active, linked, amount, message in [
            (True, True, '301', 'exceeds'), (True, False, '1', 'not linked'),
            (False, True, '1', 'Reactivate'), (True, True, '0', 'greater than zero')]:
            db = Mock()
            db.execute.return_value.fetchone.side_effect = [
                {'is_active': active, 'total_amount': Decimal('1000')}, {'linked': 1} if linked else None,
                {'amount': Decimal('700')}]
            with self.assertRaisesRegex(HTTPException, message):
                validate_receipt(db, 'contract', 'payer', Decimal(amount))

    def test_contract_changes_require_admin_and_current_revision(self):
        db = Mock()
        change = ContractChange(op='contract', action='archive', contractId=uuid4(), expectedRevision=1)
        with self.assertRaises(HTTPException) as caught:
            change_contract(db, {'user_role_id': 2}, change)
        self.assertEqual(caught.exception.status_code, 403)
        db.execute.assert_not_called()
        db.execute.return_value.fetchone.return_value = {'revision': 2}
        with self.assertRaises(HTTPException) as caught:
            change_contract(db, {'user_role_id': 1}, change)
        self.assertEqual(caught.exception.status_code, 409)

    def test_receipt_reactivation_revalidates_remaining_before_writing(self):
        db = Mock()
        db.execute.return_value.fetchone.side_effect = [
            {'transaction_id': 12, 'current_version_id': 4, 'contract_id': 'c', 'credit_user_id': 'p', 'is_active': False},
            {'transaction_amount': Decimal('400')}]
        change = TransactionChange(op='transaction', action='reactivate', id=12, expectedVersion=4)
        with patch('service.validate_receipt', side_effect=HTTPException(400, 'exceeds')) as validate, patch('service.revise') as revise:
            with self.assertRaises(HTTPException):
                transaction_change(db, {'user_role_id': 1}, change)
            validate.assert_called_once_with(db, 'c', 'p', Decimal('400'), 12)
            revise.assert_not_called()

    def test_many_users_share_one_contract_amount(self):
        payer1, payer2, contract_id = uuid4(), uuid4(), uuid4()
        db = Mock()
        db.execute.return_value.fetchall.return_value = [
            {'credit_user_id': payer1, 'is_active': True}, {'credit_user_id': payer2, 'is_active': True}]
        db.execute.return_value.fetchone.return_value = {'contract_id': contract_id}
        change_contract(db, {'user_role_id': 1}, ContractChange(op='contract', action='create', input={
            'name': 'Shared', 'totalAmount': '1000', 'creditUserIds': [payer1, payer2]}))
        inserts = [call.args for call in db.execute.call_args_list if call.args[0].startswith('INSERT')]
        self.assertEqual(inserts[0][1], ('Shared', '', Decimal('1000')))
        self.assertEqual([args[1] for args in inserts[1:]], [(contract_id, payer1), (contract_id, payer2)])

    def test_edit_cannot_reduce_total_below_receipts_or_unlink_receipt_history(self):
        payer1, payer2, contract_id = uuid4(), uuid4(), uuid4()
        for total, message in [('100', 'less than payments'), ('1000', 'cannot be unlinked')]:
            db = Mock()
            db.execute.return_value.fetchone.side_effect = [{'revision': 1}, {'amount': Decimal('500')}, {'history': True}]
            db.execute.return_value.fetchall.side_effect = [
                [{'credit_user_id': payer1}, {'credit_user_id': payer2}], [{'credit_user_id': payer1, 'is_active': True}]]
            change = ContractChange(op='contract', action='edit', contractId=contract_id, expectedRevision=1,
                                    input={'name': 'Shared', 'totalAmount': total, 'creditUserIds': [payer1]})
            with self.assertRaisesRegex(HTTPException, message):
                change_contract(db, {'user_role_id': 1}, change)
            self.assertFalse(any(call.args[0].startswith(('UPDATE', 'DELETE', 'INSERT')) for call in db.execute.call_args_list))


if __name__ == '__main__':
    unittest.main()
