-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PET_OWNER', 'VET_CLINIC', 'RESCUE_ORG', 'WARD_OFFICER');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('EN', 'NE');

-- CreateEnum
CREATE TYPE "Species" AS ENUM ('DOG', 'CAT', 'OTHER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VaccinationRecordStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AnimalType" AS ENUM ('DOG', 'CAT', 'MONKEY', 'JACKAL', 'MONGOOSE', 'LIVESTOCK', 'OTHER');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MODERATE', 'HIGH');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('REPORTED', 'UNDER_REVIEW', 'VERIFIED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "LostReportStatus" AS ENUM ('ACTIVE', 'FOUND', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('VACCINATION_REMINDER', 'BOOSTER_OVERDUE', 'LOST_PET_SCAN', 'INCIDENT_UPDATE', 'CLUSTER_ALERT', 'ACCOUNT', 'CHAT_MESSAGE');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SCHEDULED', 'SENT', 'READ', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "user_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "ward_number" INTEGER,
    "municipality" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'EN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "pets" (
    "pet_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" "Species" NOT NULL,
    "breed" TEXT,
    "gender" "Gender" NOT NULL DEFAULT 'UNKNOWN',
    "date_of_birth" TIMESTAMP(3),
    "color" TEXT,
    "photo_url" TEXT,
    "medical_notes" TEXT,
    "qr_token" TEXT NOT NULL,
    "lost_status" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pets_pkey" PRIMARY KEY ("pet_id")
);

-- CreateTable
CREATE TABLE "vaccination_records" (
    "vaccination_id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "vet_id" TEXT NOT NULL,
    "recorded_by" TEXT,
    "vaccine_name" TEXT NOT NULL,
    "batch_number" TEXT NOT NULL,
    "administered_date" TIMESTAMP(3) NOT NULL,
    "booster_due_date" TIMESTAMP(3),
    "status" "VaccinationRecordStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "notes" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaccination_records_pkey" PRIMARY KEY ("vaccination_id")
);

-- CreateTable
CREATE TABLE "veterinary_clinics" (
    "clinic_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "clinic_name" TEXT NOT NULL,
    "registration_number" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "ward_number" INTEGER,
    "municipality" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "opening_hours" TEXT,
    "service_radius_km" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "veterinary_clinics_pkey" PRIMARY KEY ("clinic_id")
);

-- CreateTable
CREATE TABLE "rescue_organizations" (
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "ward_number" INTEGER,
    "municipality" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "has_shelter" BOOLEAN NOT NULL DEFAULT true,
    "service_radius_km" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rescue_organizations_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "community_strays" (
    "stray_id" TEXT NOT NULL,
    "registered_by" TEXT NOT NULL,
    "tag_or_ear_mark" TEXT,
    "species" "Species" NOT NULL DEFAULT 'DOG',
    "gender" "Gender" NOT NULL DEFAULT 'UNKNOWN',
    "estimated_age" TEXT,
    "color" TEXT,
    "breed" TEXT,
    "physical_description" TEXT,
    "address" TEXT,
    "photo_url" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "ward_number" INTEGER,
    "municipality" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_strays_pkey" PRIMARY KEY ("stray_id")
);

-- CreateTable
CREATE TABLE "cnvr_records" (
    "cnvr_id" TEXT NOT NULL,
    "stray_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vaccine_name" TEXT,
    "vaccination_date" TIMESTAMP(3),
    "sterilization_date" TIMESTAMP(3),
    "release_latitude" DOUBLE PRECISION,
    "release_longitude" DOUBLE PRECISION,
    "release_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cnvr_records_pkey" PRIMARY KEY ("cnvr_id")
);

-- CreateTable
CREATE TABLE "bite_incidents" (
    "incident_id" TEXT NOT NULL,
    "reported_by" TEXT,
    "reporter_name" TEXT,
    "reporter_phone" TEXT,
    "animal_type" "AnimalType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "description" TEXT NOT NULL,
    "incident_date" TIMESTAMP(3) NOT NULL,
    "suspected_rabies" BOOLEAN NOT NULL DEFAULT false,
    "photo_url" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location_accuracy_m" DOUBLE PRECISION,
    "address" TEXT,
    "ward_number" INTEGER,
    "municipality" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'REPORTED',
    "handled_by" TEXT,
    "status_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bite_incidents_pkey" PRIMARY KEY ("incident_id")
);

-- CreateTable
CREATE TABLE "lost_pet_reports" (
    "lost_report_id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "last_seen_latitude" DOUBLE PRECISION,
    "last_seen_longitude" DOUBLE PRECISION,
    "last_seen_date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "status" "LostReportStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "lost_pet_reports_pkey" PRIMARY KEY ("lost_report_id")
);

-- CreateTable
CREATE TABLE "qr_scan_events" (
    "scan_id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "scanned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shared_latitude" DOUBLE PRECISION,
    "shared_longitude" DOUBLE PRECISION,
    "location_permission" BOOLEAN NOT NULL DEFAULT false,
    "finder_message" TEXT,
    "finder_contact" TEXT,
    "device_or_session_info" TEXT,

    CONSTRAINT "qr_scan_events_pkey" PRIMARY KEY ("scan_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "status" "NotificationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "dedupe_key" TEXT,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "ai_breed_predictions" (
    "prediction_id" TEXT NOT NULL,
    "pet_id" TEXT,
    "image_url" TEXT NOT NULL,
    "predicted_breed" TEXT NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "alternatives" TEXT,
    "model_version" TEXT NOT NULL,
    "owner_confirmed" BOOLEAN,
    "final_breed" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_breed_predictions_pkey" PRIMARY KEY ("prediction_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "audit_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "ip_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("audit_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "conversation_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "pet_id" TEXT,
    "subject" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("conversation_id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "message_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "chatbot_logs" (
    "chatbot_log_id" TEXT NOT NULL,
    "user_id" TEXT,
    "session_key" TEXT NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'EN',
    "question" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "safety_escalated" BOOLEAN NOT NULL DEFAULT false,
    "response_ms" INTEGER NOT NULL,
    "helpful" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_logs_pkey" PRIMARY KEY ("chatbot_log_id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("account_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_municipality_ward_number_idx" ON "users"("municipality", "ward_number");

-- CreateIndex
CREATE UNIQUE INDEX "pets_qr_token_key" ON "pets"("qr_token");

-- CreateIndex
CREATE INDEX "pets_owner_id_idx" ON "pets"("owner_id");

-- CreateIndex
CREATE INDEX "pets_lost_status_idx" ON "pets"("lost_status");

-- CreateIndex
CREATE INDEX "vaccination_records_pet_id_idx" ON "vaccination_records"("pet_id");

-- CreateIndex
CREATE INDEX "vaccination_records_vet_id_idx" ON "vaccination_records"("vet_id");

-- CreateIndex
CREATE INDEX "vaccination_records_booster_due_date_idx" ON "vaccination_records"("booster_due_date");

-- CreateIndex
CREATE UNIQUE INDEX "veterinary_clinics_user_id_key" ON "veterinary_clinics"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "veterinary_clinics_registration_number_key" ON "veterinary_clinics"("registration_number");

-- CreateIndex
CREATE INDEX "veterinary_clinics_latitude_longitude_idx" ON "veterinary_clinics"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "veterinary_clinics_verification_status_idx" ON "veterinary_clinics"("verification_status");

-- CreateIndex
CREATE UNIQUE INDEX "rescue_organizations_user_id_key" ON "rescue_organizations"("user_id");

-- CreateIndex
CREATE INDEX "rescue_organizations_latitude_longitude_idx" ON "rescue_organizations"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "rescue_organizations_verification_status_idx" ON "rescue_organizations"("verification_status");

-- CreateIndex
CREATE INDEX "community_strays_latitude_longitude_idx" ON "community_strays"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "community_strays_tag_or_ear_mark_idx" ON "community_strays"("tag_or_ear_mark");

-- CreateIndex
CREATE INDEX "community_strays_municipality_ward_number_idx" ON "community_strays"("municipality", "ward_number");

-- CreateIndex
CREATE INDEX "cnvr_records_stray_id_idx" ON "cnvr_records"("stray_id");

-- CreateIndex
CREATE INDEX "cnvr_records_organization_id_idx" ON "cnvr_records"("organization_id");

-- CreateIndex
CREATE INDEX "cnvr_records_release_latitude_release_longitude_idx" ON "cnvr_records"("release_latitude", "release_longitude");

-- CreateIndex
CREATE INDEX "bite_incidents_latitude_longitude_idx" ON "bite_incidents"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "bite_incidents_municipality_ward_number_idx" ON "bite_incidents"("municipality", "ward_number");

-- CreateIndex
CREATE INDEX "bite_incidents_status_idx" ON "bite_incidents"("status");

-- CreateIndex
CREATE INDEX "bite_incidents_incident_date_idx" ON "bite_incidents"("incident_date");

-- CreateIndex
CREATE INDEX "lost_pet_reports_pet_id_status_idx" ON "lost_pet_reports"("pet_id", "status");

-- CreateIndex
CREATE INDEX "qr_scan_events_pet_id_scanned_at_idx" ON "qr_scan_events"("pet_id", "scanned_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_status_idx" ON "notifications"("user_id", "status");

-- CreateIndex
CREATE INDEX "notifications_scheduled_at_status_idx" ON "notifications"("scheduled_at", "status");

-- CreateIndex
CREATE INDEX "ai_breed_predictions_pet_id_idx" ON "ai_breed_predictions"("pet_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_owner_id_clinic_id_pet_id_key" ON "conversations"("owner_id", "clinic_id", "pet_id");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "chatbot_logs_intent_idx" ON "chatbot_logs"("intent");

-- CreateIndex
CREATE INDEX "chatbot_logs_created_at_idx" ON "chatbot_logs"("created_at");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("pet_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_vet_id_fkey" FOREIGN KEY ("vet_id") REFERENCES "veterinary_clinics"("clinic_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "veterinary_clinics" ADD CONSTRAINT "veterinary_clinics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rescue_organizations" ADD CONSTRAINT "rescue_organizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_strays" ADD CONSTRAINT "community_strays_registered_by_fkey" FOREIGN KEY ("registered_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cnvr_records" ADD CONSTRAINT "cnvr_records_stray_id_fkey" FOREIGN KEY ("stray_id") REFERENCES "community_strays"("stray_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cnvr_records" ADD CONSTRAINT "cnvr_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "rescue_organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bite_incidents" ADD CONSTRAINT "bite_incidents_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bite_incidents" ADD CONSTRAINT "bite_incidents_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lost_pet_reports" ADD CONSTRAINT "lost_pet_reports_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("pet_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_scan_events" ADD CONSTRAINT "qr_scan_events_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("pet_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_breed_predictions" ADD CONSTRAINT "ai_breed_predictions_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("pet_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "veterinary_clinics"("clinic_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("pet_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("conversation_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_logs" ADD CONSTRAINT "chatbot_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
