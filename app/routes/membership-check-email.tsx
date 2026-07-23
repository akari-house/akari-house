import { Link } from "react-router";
import { AuthLayout } from "~/layouts/AuthLayout";

export function meta() {
  return [{ title: "Check your email | AKARI House" }];
}

export default function MembershipCheckEmail() {
  return (
    <AuthLayout
      eyebrow="Application received"
      title="Confirm where we can reach you"
    >
      <div className="status-card" role="status">
        <span className="status-mark" aria-hidden="true">
          光
        </span>
        <h2>Check your inbox</h2>
        <p>
          Use the confirmation link in the message from AKARI House. Your
          request enters human review only after your email is confirmed.
        </p>
        <p>
          The link expires after 24 hours. If no message arrives, check your
          spam folder before contacting the Membership Desk.
        </p>
      </div>
      <p className="form-footer">
        Already approved? <Link to="/login">Log in</Link>
      </p>
    </AuthLayout>
  );
}
