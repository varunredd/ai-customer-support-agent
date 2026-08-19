import { LegalShell } from "@/components/layout/LegalShell";

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        This policy explains how Jobform collects, uses, and retains information when you use the Jobform
        customer-support product, including the support portal, staff console, and related APIs.
      </p>

      <h2>Who this applies to</h2>
      <p>
        Jobform is operated for the organization that deploys the workspace. If you are a shopper using support,
        the store or business that sent you to Jobform is the data controller for your customer account. If you
        are a staff operator, your organization is the controller for your sign-in credentials and operations activity.
      </p>

      <h2>Information we process</h2>
      <ul>
        <li>Identity and contact details, such as name and email address.</li>
        <li>Order context required to evaluate a refund, including order IDs, items, amounts, and order status.</li>
        <li>Support conversation content, including typed messages and voice transcripts.</li>
        <li>Refund decisions, ledger records, escalations, and related operational events.</li>
        <li>Staff sign-in data and session cookies used to protect the operations console.</li>
        <li>Technical logs needed to operate, secure, and debug the service, with sensitive values redacted where configured.</li>
      </ul>
      <p>
        Do not submit payment-card numbers, bank account numbers, passwords, one-time codes, or government ID numbers
        in support chat. Jobform is not a payment-card processor.
      </p>

      <h2>How we use information</h2>
      <ul>
        <li>To authenticate a support session to a customer-owned order.</li>
        <li>To investigate refund requests and apply the published refund policy.</li>
        <li>To record approved refunds in the Jobform ledger and notify customers when email delivery is configured.</li>
        <li>To operate the staff console, audit agent activity, and handle human escalations.</li>
        <li>To maintain security, prevent abuse, and meet retention or legal obligations.</li>
      </ul>

      <h2>AI processing</h2>
      <p>
        Support conversations are sent to an AI model provider so the agent can reply and select tools. Voice input
        is transcribed, and spoken replies are AI-generated. Jobform does not allow the model to authorize money;
        refund eligibility and ledger writes are decided by Jobform server code. Model providers process prompts and
        transcripts under their own terms and data-processing terms.
      </p>

      <h2>Sharing</h2>
      <p>
        We share information with service providers that host, store, or process data on our behalf, such as cloud
        infrastructure, email delivery, and AI model providers. We may disclose information if required by law or to
        protect the security of the service. We do not sell personal information.
      </p>

      <h2>Retention</h2>
      <p>
        Support messages, agent-run content, operational events, notifications, and expired launch records are retained
        for the windows configured in the workspace, then redacted or deleted by the retention job. Financial refund
        records are kept until the deploying organization sets a longer legal retention schedule. You can ask the
        workspace owner to apply a different retention period where the product supports it.
      </p>

      <h2>Security</h2>
      <p>
        Jobform uses encrypted transport in production, hashed session credentials, signed store launches, staff
        authentication, and access controls on administrative APIs. No method of transmission or storage is completely
        secure. The deploying organization is responsible for secrets, backups, and access to its own workspace.
      </p>

      <h2>Your choices</h2>
      <p>
        Shoppers can start or end a support session and should contact the store for account, order, or deletion
        requests. Staff can sign out of the operations console. Depending on applicable law, you may have rights to
        access, correct, delete, or restrict processing of personal information. Send those requests to the
        organization that operates the Jobform workspace.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy as the product changes. The effective date at the top of this page will be revised
        when we do. Continued use of Jobform after an update constitutes acceptance of the revised policy.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy should be directed to the organization operating the Jobform workspace you used.
      </p>
    </LegalShell>
  );
}
