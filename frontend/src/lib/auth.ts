export type Session = {
  authenticated: boolean;
  username: string | null;
};

export const fetchSession = async (): Promise<Session> => {
  const response = await fetch("/api/session", { credentials: "include" });
  if (!response.ok) {
    return { authenticated: false, username: null };
  }
  return response.json();
};

export const login = async (
  username: string,
  password: string
): Promise<void> => {
  const response = await fetch("/api/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error("Invalid username or password");
  }
};

export const logout = async (): Promise<void> => {
  await fetch("/api/logout", { method: "POST", credentials: "include" });
};
