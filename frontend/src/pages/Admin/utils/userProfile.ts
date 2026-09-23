import type { AdminUser, UserProfile } from '../types.ts';

export const userContacts = (user: AdminUser) => user.contacts ?? (user.contact_no ? [user.contact_no] : []);

export function validateProfile(profile: UserProfile): UserProfile {
  const user_name = profile.user_name.trim();
  const contacts = profile.contacts.map((contact) => contact.trim()).filter(Boolean);
  if (!user_name || user_name.length > 48) throw new Error('Enter a name of 1–48 characters.');
  if (contacts.some((contact) => contact.length > 24)) throw new Error('Contact numbers can contain up to 24 characters.');
  if (new Set(contacts).size !== contacts.length) throw new Error('Each contact number should be listed once.');
  return { user_name, contacts };
}
