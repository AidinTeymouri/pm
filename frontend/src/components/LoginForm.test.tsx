import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/LoginForm";
import * as auth from "@/lib/auth";

describe("LoginForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls onSuccess after a valid login", async () => {
    vi.spyOn(auth, "login").mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(auth.login).toHaveBeenCalledWith("user", "password");
  });

  it("shows an inline error on invalid credentials", async () => {
    vi.spyOn(auth, "login").mockRejectedValue(new Error("nope"));
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByText(/invalid username or password/i)
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
