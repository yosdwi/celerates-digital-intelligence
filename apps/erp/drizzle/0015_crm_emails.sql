-- Sales email (QA 2026-10-08, roadmap #2): mail to and from Account (CRM) contacts, read from the pilot mailbox over
-- IMAP or sent from the ERP over SMTP (lib/mail). Only mail that matches an account is stored. Templates for composing.
CREATE TABLE IF NOT EXISTS "crm_emails" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "mailbox" text NOT NULL,
  "message_id" text NOT NULL,
  "thread_key" text NOT NULL,
  "in_reply_to" text,
  "direction" text NOT NULL,
  "from_address" text NOT NULL,
  "from_name" text,
  "to_addresses" text[] DEFAULT '{}' NOT NULL,
  "cc_addresses" text[] DEFAULT '{}' NOT NULL,
  "subject" text DEFAULT '' NOT NULL,
  "body_text" text,
  "snippet" text,
  "sent_at" timestamp with time zone NOT NULL,
  "client_id" uuid REFERENCES "crm_clients"("id") ON DELETE SET NULL,
  "contact_id" uuid REFERENCES "crm_client_contacts"("id") ON DELETE SET NULL,
  "source" text NOT NULL,
  "created_by_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "crm_emails_message_id_unique" UNIQUE ("message_id")
);
CREATE INDEX IF NOT EXISTS "idx_crm_emails_client" ON "crm_emails" USING btree ("client_id", "sent_at");
CREATE INDEX IF NOT EXISTS "idx_crm_emails_thread" ON "crm_emails" USING btree ("thread_key");

CREATE TABLE IF NOT EXISTS "crm_email_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "created_by_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Where the IMAP sync left off, per mailbox folder (UIDs are only valid within one UIDVALIDITY).
CREATE TABLE IF NOT EXISTS "mail_sync_state" (
  "mailbox" text NOT NULL,
  "folder" text NOT NULL,
  "uid_validity" bigint,
  "last_uid" bigint DEFAULT 0 NOT NULL,
  "last_synced_at" timestamp with time zone,
  "last_error" text,
  PRIMARY KEY ("mailbox", "folder")
);

INSERT INTO "crm_email_templates" ("name", "subject", "body", "created_by_name") VALUES
  ('Perkenalan layanan', 'Perkenalan Celerates untuk {{account.nama}}',
   E'Halo {{kontak.nama}},\n\nPerkenalkan, saya {{pengirim.nama}} dari Celerates. Kami membantu perusahaan seperti {{account.nama}} menyediakan talenta IT (outsourcing, headhunting, managed service).\n\nApakah ada waktu 30 menit minggu ini untuk berdiskusi tentang kebutuhan tim Anda?\n\nSalam,\n{{pengirim.nama}}', 'Sistem'),
  ('Follow-up proposal', 'Follow-up proposal {{opty.no}}',
   E'Halo {{kontak.nama}},\n\nMenindaklanjuti proposal untuk posisi {{opty.posisi}} yang kami kirimkan, apakah ada masukan dari tim {{account.nama}}?\n\nKami siap menyesuaikan jika diperlukan.\n\nSalam,\n{{pengirim.nama}}', 'Sistem'),
  ('Kirim profil kandidat', 'Profil kandidat {{opty.posisi}} untuk {{account.nama}}',
   E'Halo {{kontak.nama}},\n\nBerikut kami sampaikan profil kandidat untuk posisi {{opty.posisi}}. Mohon kabari jadwal interview yang memungkinkan.\n\nSalam,\n{{pengirim.nama}}', 'Sistem');
