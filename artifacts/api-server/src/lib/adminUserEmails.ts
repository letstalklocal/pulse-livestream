import { clerkClient } from "@clerk/express";

// Private admin responses use the authentication provider's primary address.
// Never infer an email from a payout recipient or expose Clerk's full user object.
export async function readAdminUserEmails(clerkIds: (string | null)[]) {
  const ids = [...new Set(clerkIds.filter((id): id is string => !!id))];
  const result = new Map<
    string,
    { email: string | null; emailUnavailable: boolean }
  >();
  if (!ids.length) return result;
  try {
    const { data } = await clerkClient.users.getUserList({
      userId: ids,
      limit: ids.length,
    });
    for (const user of data) {
      if (!ids.includes(user.id)) continue;
      const email =
        user.emailAddresses.find(
          (address) => address.id === user.primaryEmailAddressId,
        )?.emailAddress ?? null;
      result.set(user.id, { email, emailUnavailable: false });
    }
  } catch {
    // A provider outage must not hide the directory or imply a user has no email.
    for (const id of ids)
      result.set(id, { email: null, emailUnavailable: true });
  }
  return result;
}
