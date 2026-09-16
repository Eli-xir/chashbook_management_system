"""Head tree, permission inheritance, and effective activity.

All helpers accept an asyncpg connection so they compose inside caller
transactions. Effective permission = direct grant + all descendants.
Effective activity = head's own is_active AND all ancestors active.
"""

from .deps import error


async def all_heads(conn) -> list[dict]:
    rows = await conn.fetch(
        """
        SELECT h.head_id, h.parent_head_id, h.head_name, h.head_description,
               h.is_active, h.is_transactionable, h.image_id
        FROM Heads h ORDER BY h.head_name
        """
    )
    return [dict(r) for r in rows]


async def descendants_map(conn) -> dict[int | None, list[int]]:
    rows = await conn.fetch("SELECT head_id, parent_head_id FROM Heads")
    children: dict[int | None, list[int]] = {}
    for r in rows:
        children.setdefault(r["parent_head_id"], []).append(r["head_id"])
    return children


async def subtree_ids(conn, head_id: int) -> set[int]:
    """All descendant head IDs plus the head itself (iterative, cycle-safe)."""
    children = await descendants_map(conn)
    result: set[int] = set()
    stack = [head_id]
    while stack:
        current = stack.pop()
        if current in result:
            continue  # cycle guard; cycles are prevented at write time anyway
        result.add(current)
        stack.extend(children.get(current, []))
    return result


async def ancestor_ids(conn, head_id: int) -> list[int]:
    """Path from root to head, inclusive. Empty list if head missing or cycle."""
    rows = await conn.fetch("SELECT head_id, parent_head_id FROM Heads")
    parent = {r["head_id"]: r["parent_head_id"] for r in rows}
    if head_id not in parent:
        return []
    path: list[int] = []
    current: int | None = head_id
    seen: set[int] = set()
    while current is not None and current not in seen:
        seen.add(current)
        path.append(current)
        current = parent[current]
    path.reverse()
    return path


async def effective_head_ids(conn, user_id) -> set[int]:
    """Direct grants plus their subtrees."""
    grants = await conn.fetch(
        "SELECT head_id FROM User_head_permissions WHERE user_id = $1", user_id
    )
    effective: set[int] = set()
    for r in grants:
        effective |= await subtree_ids(conn, r["head_id"])
    return effective


async def get_head(conn, head_id: int) -> dict | None:
    row = await conn.fetchrow(
        """
        SELECT h.head_id, h.parent_head_id, h.head_name, h.head_description,
               h.is_active, h.is_transactionable, h.image_id
        FROM Heads h WHERE h.head_id = $1
        """,
        head_id,
    )
    return dict(row) if row else None


async def effective_active(conn, head_id: int) -> bool:
    """Head and every ancestor must be active."""
    path = await ancestor_ids(conn, head_id)
    if not path:
        return False
    rows = await conn.fetch("SELECT head_id, is_active FROM Heads WHERE head_id = ANY($1)", path)
    return all(r["is_active"] for r in rows)


async def user_can_submit_to(conn, user_id, head_id: int) -> tuple[bool, str]:
    """Submission needs: effective permission, transactionable flag, active chain."""
    head = await get_head(conn, head_id)
    if head is None:
        return False, "Head not found"
    effective = await effective_head_ids(conn, user_id)
    if head_id not in effective:
        return False, "No permission for this head"
    if not await effective_active(conn, head_id):
        return False, "This head is not active"
    if not head["is_transactionable"]:
        return False, "This head does not accept transactions"
    return True, ""


async def would_create_cycle(conn, head_id: int, new_parent_id: int | None) -> bool:
    """Moving head_id under new_parent_id creates a cycle if head_id is on
    new_parent_id's ancestor path (or is the same head)."""
    if new_parent_id is None:
        return False
    if head_id == new_parent_id:
        return True
    path = await ancestor_ids(conn, new_parent_id)
    return head_id in path


async def ensure_no_cycle(conn, head_id: int, new_parent_id: int | None) -> None:
    if await would_create_cycle(conn, head_id, new_parent_id):
        raise error(400, "Move rejected: this would create a cycle in the head tree")


async def visible_tree_for_user(conn, user_id) -> list[dict]:
    """Permitted branches as a nested tree. Ancestors of a granted head appear
    as navigation-only context (marked granted=False) when needed to reach it."""
    heads = {h["head_id"]: h for h in await all_heads(conn)}
    direct = {r["head_id"] for r in await conn.fetch(
        "SELECT head_id FROM User_head_permissions WHERE user_id = $1", user_id)}
    effective = await effective_head_ids(conn, user_id)
    if not effective:
        return []

    # Ancestors needed to reach direct grants, even if not themselves granted.
    needed_ancestors: set[int] = set()
    for gid in direct:
        for aid in await ancestor_ids(conn, gid):
            if aid != gid:
                needed_ancestors.add(aid)

    # The tree includes effective heads plus their navigation-only ancestors,
    # so a granted subhead under an ungranted parent is reachable.
    visible = effective | needed_ancestors
    children_map: dict[int | None, list[int]] = {}
    for hid, h in heads.items():
        if hid in visible:
            children_map.setdefault(h["parent_head_id"], []).append(hid)

    def build(head_id: int) -> dict:
        h = dict(heads[head_id])
        # granted marks effective access; ancestors get granted=False (navigation only).
        h["granted"] = head_id in effective
        h["children"] = [build(c) for c in sorted(
            children_map.get(head_id, []),
            key=lambda cid: heads[cid]["head_name"],
        )]
        return h

    roots = sorted(children_map.get(None, []), key=lambda cid: heads[cid]["head_name"])
    return [build(r) for r in roots]


async def validate_heads_exist(conn, head_ids: list[int]) -> None:
    if not head_ids:
        return
    rows = await conn.fetch("SELECT head_id FROM Heads WHERE head_id = ANY($1)", head_ids)
    found = {r["head_id"] for r in rows}
    missing = set(head_ids) - found
    if missing:
        raise error(400, f"Unknown head IDs: {sorted(missing)}")
