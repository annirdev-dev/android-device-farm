-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'BILLING');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "AppPlatform" AS ENUM ('ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "AppFileType" AS ENUM ('APK', 'AAB', 'IPA');

-- CreateEnum
CREATE TYPE "AppVersionStatus" AS ENUM ('UPLOADED', 'SCANNING', 'PROCESSING', 'READY', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DeviceArchitecture" AS ENUM ('X86_64', 'ARM64');

-- CreateEnum
CREATE TYPE "FormFactor" AS ENUM ('PHONE', 'TABLET');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('AVAILABLE', 'STARTING', 'RUNNING', 'BUSY', 'OFFLINE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "ComputeProviderType" AS ENUM ('LOCAL', 'DOCKER', 'KUBERNETES', 'CLOUD');

-- CreateEnum
CREATE TYPE "ComputeHostStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'OFFLINE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "EmulatorProviderKind" AS ENUM ('REAL_ANDROID_EMULATOR', 'MOCK');

-- CreateEnum
CREATE TYPE "EmulatorInstanceStatus" AS ENUM ('PROVISIONING', 'BOOTING', 'READY', 'BUSY', 'RESETTING', 'STOPPING', 'STOPPED', 'FAILED', 'DESTROYED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('CREATING', 'BOOTING', 'INSTALLING', 'STARTING', 'RUNNING', 'STOPPING', 'STOPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "SessionEventType" AS ENUM ('STATE_CHANGE', 'PROGRESS', 'LOG', 'INPUT', 'ERROR', 'SYSTEM');

-- CreateEnum
CREATE TYPE "LogSource" AS ENUM ('LOGCAT', 'APPLICATION', 'EMULATOR', 'SYSTEM', 'NETWORK', 'CRASH');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('VERBOSE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('RECORDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "UsageMetricType" AS ENUM ('DEVICE_MINUTES', 'CONCURRENT_DEVICES', 'STORAGE_GB', 'RECORDINGS', 'SESSIONS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'INCOMPLETE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "name" TEXT,
    "avatar_url" TEXT,
    "google_id" TEXT,
    "email_verified_at" TIMESTAMP(3),
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "platform" "AppPlatform" NOT NULL DEFAULT 'ANDROID',
    "name" TEXT NOT NULL,
    "package_name" TEXT NOT NULL,
    "icon_storage_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "app_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID,
    "file_type" "AppFileType" NOT NULL DEFAULT 'APK',
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "version_name" TEXT,
    "version_code" INTEGER,
    "min_sdk_version" INTEGER,
    "target_sdk_version" INTEGER,
    "icon_storage_key" TEXT,
    "status" "AppVersionStatus" NOT NULL DEFAULT 'UPLOADED',
    "status_message" TEXT,
    "scan_result" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL DEFAULT 'Google',
    "android_version" TEXT NOT NULL,
    "api_level" INTEGER NOT NULL,
    "resolution_width" INTEGER NOT NULL,
    "resolution_height" INTEGER NOT NULL,
    "density_dpi" INTEGER NOT NULL,
    "cpu_cores" INTEGER NOT NULL,
    "ram_mb" INTEGER NOT NULL,
    "storage_mb" INTEGER NOT NULL,
    "architecture" "DeviceArchitecture" NOT NULL DEFAULT 'X86_64',
    "formFactor" "FormFactor" NOT NULL DEFAULT 'PHONE',
    "emulator_image" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_profile_id" UUID NOT NULL,
    "compute_host_id" UUID,
    "label" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "last_heartbeat_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compute_hosts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "name" TEXT NOT NULL,
    "provider_type" "ComputeProviderType" NOT NULL,
    "hostname" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'local',
    "cpu_capacity_millicores" INTEGER NOT NULL,
    "ram_capacity_mb" INTEGER NOT NULL,
    "disk_capacity_mb" INTEGER NOT NULL,
    "gpu_available" BOOLEAN NOT NULL DEFAULT false,
    "kvm_enabled" BOOLEAN NOT NULL DEFAULT false,
    "max_concurrent_emulators" INTEGER NOT NULL DEFAULT 4,
    "cpu_usage_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ram_usage_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "disk_usage_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ComputeHostStatus" NOT NULL DEFAULT 'OFFLINE',
    "last_heartbeat_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compute_hosts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emulator_instances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "compute_host_id" UUID NOT NULL,
    "device_profile_id" UUID NOT NULL,
    "device_id" UUID,
    "provider" "EmulatorProviderKind" NOT NULL DEFAULT 'MOCK',
    "avd_name" TEXT NOT NULL,
    "data_dir" TEXT NOT NULL,
    "console_port" INTEGER,
    "adb_serial" TEXT,
    "status" "EmulatorInstanceStatus" NOT NULL DEFAULT 'PROVISIONING',
    "cpu_limit_cores" INTEGER NOT NULL,
    "ram_limit_mb" INTEGER NOT NULL,
    "disk_limit_mb" INTEGER NOT NULL,
    "boot_started_at" TIMESTAMP(3),
    "boot_completed_at" TIMESTAMP(3),
    "last_health_check_at" TIMESTAMP(3),
    "crash_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "destroyed_at" TIMESTAMP(3),

    CONSTRAINT "emulator_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "app_id" UUID NOT NULL,
    "app_version_id" UUID NOT NULL,
    "device_profile_id" UUID NOT NULL,
    "emulator_instance_id" UUID,
    "status" "SessionStatus" NOT NULL DEFAULT 'CREATING',
    "status_message" TEXT,
    "error_message" TEXT,
    "streaming_token" TEXT,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "type" "SessionEventType" NOT NULL,
    "message" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "source" "LogSource" NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "tag" TEXT,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screenshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "taken_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "storage_key" TEXT,
    "status" "RecordingStatus" NOT NULL DEFAULT 'RECORDING',
    "duration_seconds" INTEGER,
    "file_size_bytes" BIGINT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "session_id" UUID,
    "metric_type" "UsageMetricType" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "device_minutes_limit" INTEGER NOT NULL,
    "device_minutes_used" INTEGER NOT NULL DEFAULT 0,
    "current_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_deleted_at_idx" ON "organizations"("deleted_at");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "projects_organization_id_deleted_at_idx" ON "projects"("organization_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organization_id_slug_key" ON "projects"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "apps_project_id_deleted_at_idx" ON "apps"("project_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "apps_project_id_platform_package_name_key" ON "apps"("project_id", "platform", "package_name");

-- CreateIndex
CREATE INDEX "app_versions_app_id_created_at_idx" ON "app_versions"("app_id", "created_at");

-- CreateIndex
CREATE INDEX "app_versions_status_idx" ON "app_versions"("status");

-- CreateIndex
CREATE INDEX "device_profiles_android_version_idx" ON "device_profiles"("android_version");

-- CreateIndex
CREATE INDEX "device_profiles_api_level_idx" ON "device_profiles"("api_level");

-- CreateIndex
CREATE INDEX "device_profiles_is_enabled_idx" ON "device_profiles"("is_enabled");

-- CreateIndex
CREATE INDEX "devices_device_profile_id_status_idx" ON "devices"("device_profile_id", "status");

-- CreateIndex
CREATE INDEX "devices_compute_host_id_idx" ON "devices"("compute_host_id");

-- CreateIndex
CREATE INDEX "compute_hosts_status_idx" ON "compute_hosts"("status");

-- CreateIndex
CREATE INDEX "compute_hosts_provider_type_idx" ON "compute_hosts"("provider_type");

-- CreateIndex
CREATE INDEX "emulator_instances_compute_host_id_status_idx" ON "emulator_instances"("compute_host_id", "status");

-- CreateIndex
CREATE INDEX "emulator_instances_status_idx" ON "emulator_instances"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_emulator_instance_id_key" ON "sessions"("emulator_instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_streaming_token_key" ON "sessions"("streaming_token");

-- CreateIndex
CREATE INDEX "sessions_organization_id_created_at_idx" ON "sessions"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "sessions_user_id_created_at_idx" ON "sessions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "sessions_last_activity_at_idx" ON "sessions"("last_activity_at");

-- CreateIndex
CREATE INDEX "session_events_session_id_created_at_idx" ON "session_events"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "logs_session_id_created_at_idx" ON "logs"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "logs_session_id_source_idx" ON "logs"("session_id", "source");

-- CreateIndex
CREATE INDEX "logs_session_id_level_idx" ON "logs"("session_id", "level");

-- CreateIndex
CREATE INDEX "screenshots_session_id_created_at_idx" ON "screenshots"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "recordings_session_id_created_at_idx" ON "recordings"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "usage_organization_id_metric_type_period_start_idx" ON "usage"("organization_id", "metric_type", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organization_id_key" ON "subscriptions"("organization_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apps" ADD CONSTRAINT "apps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_versions" ADD CONSTRAINT "app_versions_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_versions" ADD CONSTRAINT "app_versions_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_device_profile_id_fkey" FOREIGN KEY ("device_profile_id") REFERENCES "device_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_compute_host_id_fkey" FOREIGN KEY ("compute_host_id") REFERENCES "compute_hosts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compute_hosts" ADD CONSTRAINT "compute_hosts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emulator_instances" ADD CONSTRAINT "emulator_instances_compute_host_id_fkey" FOREIGN KEY ("compute_host_id") REFERENCES "compute_hosts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emulator_instances" ADD CONSTRAINT "emulator_instances_device_profile_id_fkey" FOREIGN KEY ("device_profile_id") REFERENCES "device_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emulator_instances" ADD CONSTRAINT "emulator_instances_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_app_version_id_fkey" FOREIGN KEY ("app_version_id") REFERENCES "app_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_profile_id_fkey" FOREIGN KEY ("device_profile_id") REFERENCES "device_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_emulator_instance_id_fkey" FOREIGN KEY ("emulator_instance_id") REFERENCES "emulator_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage" ADD CONSTRAINT "usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage" ADD CONSTRAINT "usage_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
