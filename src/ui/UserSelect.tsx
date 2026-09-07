import { useEffect, useState } from 'react';
import { searchUsers, updateUserInitials, type BackendUserSearchResult } from '../api/backend';
import { getCurrentUserId, onCurrentUser, setCurrentUserId } from '../storage/currentUser';
import { promptDialog } from './dialogs';

// Who is writing: a select over the registry's users, remembered in this browser. The initials
// next to it go into experiment and batch codes and can be edited in place.
export default function UserSelect() {
  const [users, setUsers] = useState<BackendUserSearchResult[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(getCurrentUserId());

  useEffect(() => onCurrentUser(setCurrentId), []);

  useEffect(() => {
    let cancelled = false;
    searchUsers('')
      .then((items) => {
        if (cancelled) {
          return;
        }
        setUsers(items);
        // No choice yet: the first user is as good a default as the signing dialog's.
        if (!getCurrentUserId() && items[0]) {
          setCurrentUserId(items[0].id);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const current = users.find((user) => user.id === currentId) ?? null;

  const editInitials = async () => {
    if (!current) {
      return;
    }
    const next = await promptDialog({
      title: 'Initials',
      label: `Initials for ${current.label}`,
      defaultValue: current.initials ?? '',
      confirmLabel: 'Save',
      message: 'Used in experiment and batch codes, e.g. TS-012-A.'
    });
    if (next === null) {
      return;
    }
    const updated = await updateUserInitials(current.id, next);
    setUsers((previous) => previous.map((user) => (user.id === updated.id ? updated : user)));
  };

  if (users.length === 0) {
    return null;
  }

  return (
    <div className="user-select" title="Who is writing; used for signing and batch codes">
      <select value={currentId ?? ''} onChange={(event) => setCurrentUserId(event.target.value || null)} aria-label="Current user">
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.label}
          </option>
        ))}
      </select>
      {current && (
        <button type="button" className="link-button user-initials" onClick={() => void editInitials()} title="Edit initials">
          {current.initials || '··'}
        </button>
      )}
    </div>
  );
}
