"""Request shapes shared by the single change endpoint."""
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=48)]
Password = Annotated[str, StringConstraints(min_length=1, max_length=256)]


class Model(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Login(Model):
    username: Name
    password: Password


class Profile(Model):
    description: str = Field(default="", max_length=4000)
    user_name: Name
    contacts: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=24)]] = Field(default_factory=list, max_length=20)


class AttachmentRef(Model):
    id: Annotated[str, StringConstraints(pattern=r'^\d+$')]
    # Display metadata is accepted for compatibility, but never trusted or persisted.
    kind: Literal['image', 'voice']
    name: str
    url: str


class TransactionInput(Model):
    amount: Decimal = Field(ge=0, le=999999999999.99, max_digits=18, decimal_places=2, allow_inf_nan=False)
    headId: int
    description: str = Field(default="", max_length=4000)
    transactionTypeId: Literal[1] = 1
    attachments: list[AttachmentRef] = Field(default_factory=list)


class HeadCreate(Model):
    op: Literal['create']
    temp_id: int = Field(lt=0)
    head_name: Name
    parent_head_id: int | None
    head_description: str = Field(default="", max_length=4000)
    is_transactionable: bool = False


class HeadEdit(Model):
    op: Literal['edit']
    head_id: int
    head_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    head_description: str | None = Field(default=None, max_length=4000)
    image_url: str | None
    is_transactionable: bool


class HeadMove(Model):
    op: Literal['move']
    head_id: int
    new_parent_id: int | None


class HeadMerge(Model):
    op: Literal['merge']
    source_head_id: int
    target_head_id: int
    backup: bool = False


class HeadDelete(Model):
    op: Literal['delete']
    head_id: int


class HeadBackup(Model):
    op: Literal['backup']
    head_id: int


class HeadActive(Model):
    op: Literal['active']
    head_id: int
    is_active: bool


class HeadsChange(Model):
    op: Literal['heads']
    revision: int
    changes: list[Annotated[HeadCreate | HeadEdit | HeadMove | HeadMerge | HeadDelete | HeadActive | HeadBackup, Field(discriminator='op')]]


class PermissionsChange(Model):
    op: Literal['permissions']
    userId: UUID
    ids: list[int]


class UserChange(Model):
    op: Literal['user']
    action: Literal['create', 'profile', 'password', 'deactivate', 'reactivate', 'delete']
    userId: UUID | None = None
    profile: Profile | None = None
    password: Password | None = None


class TransactionChange(Model):
    op: Literal['transaction']
    action: Literal['submit', 'credit', 'edit', 'deactivate', 'reactivate', 'delete']
    userId: UUID | None = None
    id: int | None = None
    expectedVersion: int | None = None
    input: TransactionInput | None = None



Change = Annotated[HeadsChange | PermissionsChange | UserChange | TransactionChange, Field(discriminator='op')]
