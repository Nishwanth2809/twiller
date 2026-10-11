// A generation represents one sign-in/restore/logout intent. Old asynchronous
// responses must never publish an account after a newer intent has started.
export class AuthGeneration {
  private value = 0;
  next() { return ++this.value; }
  current(generation: number) { return generation === this.value; }
  async publish<T>(generation: number, load: () => Promise<T>, commit: (value: T) => void) {
    const value = await load();
    if (this.current(generation)) commit(value);
    return value;
  }
}

export async function completeSession<T>(
  session: () => Promise<{ requiresOtp: boolean }>,
  profile: () => Promise<T>,
): Promise<{ status: "pending" } | { status: "authenticated"; user: T }> {
  if ((await session()).requiresOtp) return { status: "pending" };
  return { status: "authenticated", user: await profile() };
}
