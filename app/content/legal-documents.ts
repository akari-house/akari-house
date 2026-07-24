export const legalContactEmail = "maven@akari.club";
export type LegalDocumentKey = "privacy" | "terms" | "community";

export interface LegalDocument {
  key: LegalDocumentKey;
  path: string;
  eyebrow: string;
  title: string;
  shortTitle: string;
  version: string;
  effectiveDate: string;
  intro: string;
  summary: string[];
  sections: {
    id: string;
    title: string;
    paragraphs: string[];
    bullets?: string[];
  }[];
}

export const legalDocuments: Record<LegalDocumentKey, LegalDocument> = {
  terms: {
    key: "terms",
    path: "/terms",
    eyebrow: "Participation agreement",
    title: "Terms of participation",
    shortTitle: "Terms",
    version: "2026-07-24",
    effectiveDate: "24 July 2026",
    intro:
      "The agreement governing accounts, membership and professional participation in AKARI House.",
    summary: [
      "AKARI is a reviewed professional community, not an investment adviser, employer, talent agency or party to agreements between members.",
      "We do not require full authority over your social accounts. You choose whether to provide public links or audience information.",
      "Private contact and Creator verification information is shared only for the audience or opportunity you authorize.",
    ],
    sections: [
      {
        id: "agreement",
        title: "Agreement and operator",
        paragraphs: [
          "These Terms govern your access to and use of AKARI House (AKARI, we, us). By creating an account, you agree to these Terms and the Community Guidelines and acknowledge the Privacy Notice.",
          `Questions and legal notices may be sent to ${legalContactEmail}. AKARI's formal legal-entity, registration and registered-address details must be added before a commercial public launch.`,
        ],
      },
      {
        id: "eligibility",
        title: "Eligibility and membership",
        paragraphs: [
          "AKARI is currently intended for adults aged 18 or older who have legal capacity to enter an agreement. You must provide accurate information and keep it current.",
          "Applying does not guarantee membership. AKARI may verify, waitlist or decline an application, restrict features, or suspend access to protect members and the service. Verification records only the checks described at that time; it is not an endorsement or guarantee of identity, ability, audience quality, creditworthiness, project quality or future conduct.",
        ],
      },
      {
        id: "accounts",
        title: "Accounts and security",
        paragraphs: [
          "You are responsible for activity through your account and for protecting your password and linked services. Notify AKARI promptly if you believe your account has been compromised.",
          "Do not impersonate another person or organization, create deceptive accounts, circumvent a restriction, or provide fabricated credentials, metrics or verification evidence.",
        ],
      },
      {
        id: "social-accounts",
        title: "Social accounts and audience information",
        paragraphs: [
          "AKARI does not require you to connect a social-media account or grant AKARI authority to control it. Unless a separately described optional integration is introduced and you actively authorize it, AKARI cannot post, follow, message, change settings, administer an account, or access private social content in your name.",
          "You may voluntarily provide a public profile URL, handle, screenshot, media kit or audience figure. AKARI may display it according to your visibility choices and use it to review eligibility or opportunity fit. Metrics may be self-reported, delayed, incomplete or inaccurate. Where practical, AKARI labels the source and date instead of presenting every metric as independently verified.",
        ],
      },
      {
        id: "visibility",
        title: "Profiles, connections and contact details",
        paragraphs: [
          "Information you mark public or visible to AKARI members may be viewed by that audience. Connection-only information becomes available only after a mutual connection is accepted. A pending request is not a connection.",
          "Founder, Creator and Investor contact details are not automatically public. AKARI may disclose them when you select the relevant visibility, accept a connection, request an introduction, participate in an opportunity, or otherwise direct AKARI to share them. Recipients may use the information only for the professional purpose for which it was disclosed.",
        ],
      },
      {
        id: "creator-disclosure",
        title: "Creator verification and project disclosure",
        paragraphs: [
          "AKARI may privately review information supplied to verify a Creator's identity, role, portfolio, audience or eligibility. Submitting verification material does not make it visible to the entire network.",
          "When a Creator expresses interest in, applies to, accepts an invitation for, or explicitly approves disclosure to a specific project, AKARI may share with that project the information identified at that step and reasonably needed to evaluate or coordinate the opportunity. Permission for one project is not permission for unrelated or future projects.",
        ],
      },
      {
        id: "content",
        title: "Your content and permissions",
        paragraphs: [
          "You retain ownership of content you submit. You grant AKARI a non-exclusive, worldwide, royalty-free licence to host, store, reproduce, format, display and transmit it only as needed to operate, secure and present the service according to your visibility and disclosure choices.",
          "You confirm that you have the rights needed to submit the content. The licence ends when content is deleted or your account closes, except for reasonable backups, legal retention, records needed to establish or defend claims, and information already shared at your direction.",
        ],
      },
      {
        id: "opportunities",
        title: "Projects, introductions and outcomes",
        paragraphs: [
          "AKARI provides discovery, introduction and coordination tools. Unless expressly stated for a specific service, AKARI is not a party to agreements between members, does not employ members, and does not provide investment, legal, tax or financial advice.",
          "AKARI does not guarantee funding, participation, payment, attendance, performance, audience metrics, project safety or commercial outcomes. Members must conduct their own diligence and should use appropriate written agreements.",
        ],
      },
      {
        id: "acceptable-use",
        title: "Acceptable use",
        paragraphs: [
          "The Community Guidelines form part of these Terms. You must respect permissions, privacy settings, intellectual property and applicable law.",
        ],
        bullets: [
          "Do not scrape, harvest, compile, sell or republish member data.",
          "Do not harass, threaten, discriminate, dox, stalk or evade blocks.",
          "Do not send spam, phishing, malware, deceptive promotions or unsolicited bulk outreach.",
          "Do not misrepresent projects, compensation, affiliations, metrics or investment opportunities.",
          "Do not bypass security, access controls, moderation or rate limits.",
        ],
      },
      {
        id: "moderation",
        title: "Moderation and termination",
        paragraphs: [
          "AKARI may investigate reports and warn members, restrict visibility or features, remove content, reject verification, suspend or terminate accounts where reasonably necessary to enforce these Terms, protect people or the service, or comply with law.",
          "AKARI considers context, severity, recurrence and credible risk. Where safe and legally permitted, we provide a reason and an available review route. Fraudulent or abusive reports may themselves violate these Terms.",
        ],
      },
      {
        id: "third-parties",
        title: "Third-party services",
        paragraphs: [
          "AKARI uses service providers that may include Cloudflare for application infrastructure and media storage, Resend for transactional email, and Telegram when you voluntarily link Telegram features. Their availability and processing may also be governed by their own terms.",
          "Telegram linking is optional. AKARI does not require social-platform authorization for ordinary membership.",
        ],
      },
      {
        id: "liability",
        title: "Availability, liability and changes",
        paragraphs: [
          "AKARI aims to operate the service with reasonable care, but it may experience interruptions, errors or third-party failures. Nothing in these Terms excludes liability or mandatory rights that cannot legally be excluded.",
          "To the extent permitted by law, AKARI is not responsible for indirect or consequential loss or for the conduct, content, offers or agreements of members or third parties. Jurisdiction-specific liability, governing-law, venue and consumer wording must be finalized by qualified counsel after AKARI's legal entity and establishment are confirmed.",
          "We may update these Terms for legal, security, operational or service changes. Material changes will be communicated through the service or registered email, and fresh agreement will be requested where required.",
        ],
      },
    ],
  },
  privacy: {
    key: "privacy",
    path: "/privacy",
    eyebrow: "Privacy notice",
    title: "How AKARI handles information",
    shortTitle: "Privacy",
    version: "2026-07-24",
    effectiveDate: "24 July 2026",
    intro:
      "What AKARI collects, why it is used, who can receive it, and the choices available to you.",
    summary: [
      "We collect information you provide plus limited security and participation records needed to operate AKARI.",
      "We do not require full access to social accounts and do not treat public information as permission for unrestricted reuse.",
      "Your profile, connections and opportunity-specific choices control disclosure inside the network.",
    ],
    sections: [
      {
        id: "controller",
        title: "Who is responsible",
        paragraphs: [
          `AKARI House determines how personal data is used for the service. Privacy questions and rights requests may be sent to ${legalContactEmail}. Formal controller identity, registered address and representative details must be completed when AKARI's legal entity and establishment are confirmed.`,
        ],
      },
      {
        id: "data",
        title: "Information we collect",
        paragraphs: [
          "We collect account and application information, roles, profile content, visibility choices, public social links or metrics you submit, project and event activity, connections, opportunity interests, contact-sharing choices, reports, verification material, profile photos, Telegram identifiers when linked, and communications with AKARI.",
          "We also create technical and security records such as session, audit, rate-limit, delivery, login and moderation records. Where described, AKARI may record limited information from a permitted public or authorized source, including its source and date.",
        ],
      },
      {
        id: "purposes",
        title: "Why we use information",
        paragraphs: [
          "We use information to review membership, provide accounts and profiles, enforce visibility, support connections, projects, events and introductions, verify claims, deliver requested communications, prevent abuse, moderate content, protect the service, meet legal obligations and establish or defend legal claims.",
          "Depending on the activity and applicable law, processing may be necessary to provide the requested service, comply with law, pursue legitimate interests in security and community integrity, or carry out a separate optional choice you make.",
        ],
      },
      {
        id: "social",
        title: "Social links and metrics",
        paragraphs: [
          "AKARI does not require credentials or full authority over a social account. Public profile links, handles and audience information are optional unless clearly identified as necessary for a specific verification or opportunity.",
          "Public availability is not blanket permission. If AKARI obtains personal data from another source, we assess purpose and necessity, record the source where appropriate, and provide legally required transparency and correction or objection routes. Metrics should be read with their source and last-reported or last-checked status.",
        ],
      },
      {
        id: "visibility",
        title: "Visibility and network sharing",
        paragraphs: [
          "Applicant profiles remain private. Approved members choose whether a profile is public, visible to approved AKARI members, limited to accepted connections, or private. These rules are enforced by the server.",
          "Private contact details are disclosed only under the visibility and permission shown in the product. Information shared at your direction may remain with a recipient after you withdraw future permission; withdrawal stops new disclosure by AKARI but cannot automatically recall a legitimate earlier disclosure.",
        ],
      },
      {
        id: "creators",
        title: "Creator verification and projects",
        paragraphs: [
          "Creator verification material is available only to authorized AKARI personnel and service providers that need it for verification, fraud prevention and opportunity administration. It is not automatically displayed to members or projects.",
          "AKARI shares relevant Creator details with a particular project only after the Creator expresses interest, applies, accepts an invitation, or explicitly approves that project-specific disclosure. One permission does not apply to unrelated projects.",
        ],
      },
      {
        id: "recipients",
        title: "Recipients and service providers",
        paragraphs: [
          "Recipients may include members you authorize, selected project owners, service providers operating the platform, professional advisers, and authorities where legally required.",
          "Infrastructure and delivery providers may include Cloudflare, Resend and Telegram for linked features. Some processing may occur outside your country. Where required, AKARI must use an applicable transfer mechanism and appropriate safeguards.",
        ],
      },
      {
        id: "retention",
        title: "Media, security and retention",
        paragraphs: [
          "Approved members may upload a profile photograph to private object storage. The Worker serves it according to profile visibility. Replacing or removing an active photo removes the previous active object through the application workflow.",
          "AKARI uses access controls, hashed passwords, scoped visibility checks, rate limits and audit records. We keep account and profile information while an account is active and retain security, acceptance, moderation and transaction records only for periods reasonably needed to operate safely, comply with law and resolve disputes.",
          "A category-by-category retention schedule, including D1 records, object storage, transactional delivery logs and backups, must be finalized before broad public onboarding.",
        ],
      },
      {
        id: "rights",
        title: "Your rights and choices",
        paragraphs: [
          `Depending on applicable law, you may request access, correction, deletion, restriction or portability; object to certain processing; withdraw an optional permission prospectively; and complain to a competent supervisory authority. Send requests to ${legalContactEmail}. AKARI may verify identity proportionately.`,
          "You can update profile information and visibility in your account and unlink Telegram. Account export and closure tools are planned; until available, requests are handled through the privacy contact.",
        ],
      },
      {
        id: "changes",
        title: "Changes to this notice",
        paragraphs: [
          "AKARI may update this notice when its product, providers or legal obligations change. The current version and effective date appear above. Material changes will be communicated through the service or registered email where appropriate.",
        ],
      },
    ],
  },
  community: {
    key: "community",
    path: "/community-guidelines",
    eyebrow: "Community standard",
    title: "Community Guidelines",
    shortTitle: "Guidelines",
    version: "2026-07-24",
    effectiveDate: "24 July 2026",
    intro:
      "The conduct standard for safe, useful professional participation throughout AKARI House.",
    summary: [
      "Be genuine, give context, and represent work and metrics honestly.",
      "A profile or project interest is not permission for unrelated outreach or data reuse.",
      "Harassment, scraping, fraud, spam and attempts to evade safety controls are prohibited.",
    ],
    sections: [
      {
        id: "genuine",
        title: "Be genuine",
        paragraphs: [
          "Use your real professional identity or accurately represent an organization. Do not impersonate others, fabricate credentials, manipulate audience evidence, buy deceptive engagement or misrepresent project terms.",
        ],
      },
      {
        id: "context",
        title: "Lead with context",
        paragraphs: [
          "Explain why a connection, collaboration or investment conversation may be relevant. Thoughtful, specific requests are welcome; high-volume or unrelated solicitation is not.",
        ],
      },
      {
        id: "consent",
        title: "Respect consent and boundaries",
        paragraphs: [
          "A visible profile, pending connection or project interest is not permission for unrelated marketing. Respect visibility settings, declined requests, blocks, withdrawals and communication preferences. Never circumvent a block through another account or channel.",
        ],
      },
      {
        id: "information",
        title: "Keep information in its intended context",
        paragraphs: [
          "Use member and Creator information only for the connection, verification, introduction or project purpose for which it was shown. Do not scrape, enrich, compile, sell, republish or upload it into external prospecting, facial-recognition, advertising or AI-training systems without an appropriate legal basis and permission where required.",
        ],
      },
      {
        id: "safety",
        title: "Create a safe professional community",
        paragraphs: [
          "AKARI prohibits harassment, stalking, threats, hate, humiliation, sexual coercion, exploitation, bullying, doxxing and unwanted sexual content. Never share intimate imagery without consent or content that exploits or endangers children.",
        ],
      },
      {
        id: "opportunities",
        title: "Make opportunities honest and safe",
        paragraphs: [
          "Projects should clearly describe the organizer, purpose, expected contribution, eligibility, compensation or lack of compensation, material risks, usage rights and important deadlines.",
        ],
        bullets: [
          "No advance-fee scams, pyramid schemes or disguised recruitment funnels.",
          "No pressure to transfer money, credentials or sensitive documents without appropriate diligence.",
          "No false endorsements, guaranteed returns or misleading financial promotion.",
          "Use written terms before substantive Creator work or transfer of rights.",
        ],
      },
      {
        id: "content",
        title: "Respect creators and intellectual property",
        paragraphs: [
          "Upload only material you own or may lawfully use. Do not reuse a Creator's name, likeness, submission or work outside the agreed evaluation or project scope. Credit and compensate people according to the applicable agreement.",
        ],
      },
      {
        id: "security",
        title: "No spam, manipulation or attacks",
        paragraphs: [
          "Do not send unsolicited bulk messages, coordinate harassment, manipulate engagement, phish, distribute malware, test security without authorization, automate scraping, or attempt to bypass account, rate, visibility or moderation controls.",
        ],
      },
      {
        id: "reporting",
        title: "Reporting and enforcement",
        paragraphs: [
          `Use the in-product report control or email ${legalContactEmail} with the relevant profile or content, reason and supporting context. AKARI may warn, limit reach or features, remove material, preserve evidence, suspend or terminate accounts, and contact appropriate authorities where required.`,
          "Enforcement considers context, severity, recurrence and credible risk. Where safe and legally permitted, AKARI provides reasons and an available review route. Knowingly abusive or fraudulent reports may violate these Guidelines.",
          "AKARI is not an emergency service. If someone is in immediate danger, contact the competent local emergency service.",
        ],
      },
    ],
  },
};

export const legalDocumentByPath = Object.fromEntries(
  Object.values(legalDocuments).map((document) => [document.path, document]),
) as Record<string, LegalDocument>;
