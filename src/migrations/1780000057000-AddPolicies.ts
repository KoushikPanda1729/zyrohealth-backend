import { MigrationInterface, QueryRunner } from 'typeorm';

const PRIVACY_POLICY_CONTENT = `ZyroHealth ("we", "us") operates the ZyroHealth mobile app, WhatsApp-based service, and website (together, the "Service"), a telemedicine and pharmacy platform that connects you with doctors, hospitals, ambulances, and pharmacies. This policy explains what information we collect, why we collect it, and the choices you have.

Because the Service handles health information, please read this policy carefully before using it. By creating an account or using the Service, you agree to the collection and use of information as described here.

1. Information We Collect

Account information — Full name, phone number, email address, password (if you sign up with email), profile photo, and your role on the platform (patient, doctor, or pharmacy staff).

Health information — Date of birth, gender, blood group, allergies, and chronic conditions you add to your profile; prescriptions and medical history recorded during consultations; doctor consultation notes; and, if you use the women's health features, menstrual cycle tracking data. This is sensitive personal data — we collect it only with your consent, to provide the care you request, and we apply additional access controls to it.

Consultation & communications — Chat messages, voice/video call metadata, and AI health-assistant conversations with our in-app assistant, used to connect you with a doctor and maintain a record of your care. If you contact us through WhatsApp, we receive the messages you send through WhatsApp's platform.

Location — With your permission, precise or approximate location, used to dispatch an ambulance to you, or to show nearby hospitals and pharmacies. You can decline location access; some features will then be unavailable.

Payment information — Payments for consultations and medicine orders are processed by Stripe. We do not store your full card number — Stripe handles that directly and shares with us only what's needed to confirm and reconcile your order (e.g. amount, status, last 4 digits).

Device & usage information — Standard technical data such as device type, operating system, app version, crash logs, and general usage patterns, used to keep the Service reliable and secure.

2. How We Use Your Information

- To create and manage your account, and verify your identity via OTP.
- To connect you with doctors, hospitals, ambulances, and pharmacies, and to fulfill orders.
- To maintain your medical records and consultation history for continuity of care.
- To process payments and prevent fraud.
- To send appointment reminders, order updates, and service notifications (including via WhatsApp).
- To improve the Service, including via our AI health assistant.
- To comply with applicable law, including medical record-keeping requirements.

3. Who We Share Information With

We share information only as needed to run the Service:

- Doctors, hospitals, and pharmacies you interact with on the platform, so they can provide care or fulfill an order.
- Service providers we use to operate the platform: Stripe (payments), Twilio (SMS/OTP delivery), Firebase (authentication and notifications), OpenAI (AI health assistant), and LiveKit (voice/video calls). Each processes data only on our instructions.
- WhatsApp / Meta Platforms, when you choose to interact with us over WhatsApp.
- Legal or safety reasons — if required by law, or to protect the rights, safety, or property of ZyroHealth, our users, or the public.

We do not sell your personal or health information.

4. Data Retention

We retain account and health information for as long as your account is active, and afterward for as long as needed to meet medical record-keeping obligations, resolve disputes, and enforce our agreements. You can request deletion of your account as described below.

5. Your Rights & Choices

You can access, update, or delete your profile information from within the app, or by contacting us at privacy@zyrohealth.com. Depending on where you live, you may have additional rights — including under India's Digital Personal Data Protection Act, 2023 — to access, correct, or erase your personal data, and to withdraw consent at any time. Withdrawing consent may limit our ability to provide certain features.

6. Data Security

We use industry-standard safeguards — encryption in transit, access controls, and restricted internal access to health records — to protect your information. No system is perfectly secure, so we can't guarantee absolute security, but we work to protect your data and will notify you as required by law if a breach affects you.

7. Children's Privacy

The Service is not directed at children under 18. If you are booking care for a minor, you must do so as their parent or legal guardian.

8. Changes to This Policy

We may update this policy as the Service evolves. Where changes are material, we'll notify you in the app or by email before they take effect.

9. Contact Us

Questions about this policy or your data can be sent to privacy@zyrohealth.com.`;

export class AddPolicies1780000057000 implements MigrationInterface {
  name = 'AddPolicies1780000057000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Global — owned by the platform, same scope as banners/platform_app_configs,
    // managed on the Policies admin page (not a tenant-permissioned resource).
    await queryRunner.query(`
      CREATE TABLE "policies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "slug" character varying NOT NULL,
        "title" character varying NOT NULL,
        "content" text NOT NULL DEFAULT '',
        "is_published" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_policies" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_policies_slug" UNIQUE ("slug")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_policies_slug" ON "policies" ("slug")
    `);

    // Seed the three most common legal documents a telemedicine/pharmacy
    // platform needs — privacy policy filled in with a real draft (this
    // is the URL Play Console/App Store requires), the other two left as
    // unpublished placeholders for the platform owner to fill in.
    await queryRunner.query(
      `INSERT INTO "policies" ("slug", "title", "content", "is_published") VALUES ($1, $2, $3, $4)`,
      ['privacy-policy', 'Privacy Policy', PRIVACY_POLICY_CONTENT, true],
    );
    await queryRunner.query(
      `INSERT INTO "policies" ("slug", "title", "content", "is_published") VALUES ($1, $2, $3, $4)`,
      ['terms-of-service', 'Terms of Service', '', false],
    );
    await queryRunner.query(
      `INSERT INTO "policies" ("slug", "title", "content", "is_published") VALUES ($1, $2, $3, $4)`,
      ['refund-policy', 'Refund & Cancellation Policy', '', false],
    );

    // Superseded by the policies table above.
    await queryRunner.query(`
      ALTER TABLE "platform_app_config"
      DROP COLUMN IF EXISTS "privacy_policy"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "platform_app_config"
      ADD COLUMN "privacy_policy" text
    `);
    await queryRunner.query(`DROP TABLE "policies"`);
  }
}
