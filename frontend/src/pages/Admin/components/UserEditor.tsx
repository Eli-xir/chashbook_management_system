import { useRef, useState } from 'react';
import type { AdminUser, CreateUserInput, UserProfile } from '../types';
import { userContacts, validateProfile } from '../utils/userProfile';
import { Dialog } from './Dialog';
import { PasswordInput } from '../../../PasswordInput';

export function UserEditor({ user, mode, onSaveProfile, onChangePassword, onCreateUser, onClose }: {
  user: AdminUser; mode: 'profile' | 'password' | 'create'; onClose: () => void;
  onCreateUser: (input: CreateUserInput) => Promise<void>;
  onSaveProfile: (userId: string, profile: UserProfile) => Promise<void>;
  onChangePassword?: (userId: string, password: string) => Promise<void>;
}) {
  const [description, setDescription] = useState(user.description ?? '');
  const [name, setName] = useState(user.user_name);
  const [contacts, setContacts] = useState(() => userContacts(user).map((value, id) => ({ id, value })));
  const nextContactId = useRef(userContacts(user).length);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changingPassword = mode === 'password';
  const creating = mode === 'create';

  async function save() {
    setError('');
    if ((changingPassword || creating) && (!password.trim() || password !== confirmation)) {
      setError('Enter the same new password in both fields.');
      return;
    }
    setBusy(true);
    try {
      if (changingPassword) {
        if (!onChangePassword) throw new Error('Password changes are currently unavailable.');
        await onChangePassword(user.user_id, password);
        setPassword('');
        setConfirmation('');
      } else {
        const profile = validateProfile({ user_name: name, description, contacts: contacts.map((contact) => contact.value) });
        if (creating) await onCreateUser({ ...profile, password });
        else await onSaveProfile(user.user_id, profile);
      }
      onClose();
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save. Please retry.'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog title={creating ? 'Create user' : `${changingPassword ? 'Change password' : 'Edit account'} · ${user.user_name}`}
      onClose={onClose} busy={busy}>
      <form className="flex-col gap-md" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <fieldset className="field flex-col gap-md" disabled={busy}>
          {!changingPassword && <label className="field"><span>Name</span><input required maxLength={48} value={name} onChange={(event) => setName(event.target.value)} /></label>}
          {(changingPassword || creating) && <>
            <label className="field">
              <span>New password</span>
              <PasswordInput autoComplete="new-password" required value={password}
                onChange={(event) => setPassword(event.target.value)} />
            </label>
            <label className="field">
              <span>Confirm new password</span>
              <PasswordInput autoComplete="new-password" required value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)} />
            </label>
            {changingPassword && !onChangePassword && <p role="status" className="text-muted">
              Password changes are unavailable until the account service is connected.
            </p>}
          </>}
          {!changingPassword && <>
            <label className="field"><span>Description</span><textarea maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <h3 className="section-label">Contact numbers</h3>
            {contacts.map((contact, index) => (
              <div key={contact.id} className="contact-editor flex-row items-center gap-sm">
                <label className="field">
                  <span>Contact {index + 1}</span>
                  <input type="tel" maxLength={24} value={contact.value}
                    onChange={(event) => setContacts((current) => current.map((item) =>
                      item.id === contact.id ? { ...item, value: event.target.value } : item
                    ))} />
                </label>
                <button type="button" className="btn" aria-label={`Remove contact ${index + 1}`}
                  onClick={() => setContacts((current) => current.filter((item) => item.id !== contact.id))}>Remove</button>
              </div>
            ))}
            <button type="button" className="btn" onClick={() => {
              const id = nextContactId.current++;
              setContacts((current) => [...current, { id, value: '' }]);
            }}>+ Add contact</button>
          </>}
        </fieldset>
        {error && <p role="alert" className="text-error">{error}</p>}
        <div className="flex-row justify-end gap-sm">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" disabled={busy || (changingPassword && !onChangePassword)}>
            {busy ? 'Saving…' : creating ? 'Create user' : changingPassword ? 'Change password' : 'Save account'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
