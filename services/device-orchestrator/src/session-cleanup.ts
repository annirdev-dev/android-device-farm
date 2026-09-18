import { prisma } from "@devicefarm/database";
import type { DestroySessionJobData } from "@devicefarm/shared";
import { computeProviderFor } from "./compute-providers";
import { emitSystemEvent } from "./events";

/**
 * Full teardown for step "SESSION CLEANUP" in the spec: stop the app (killed
 * along with the emulator process), stop the emulator, release the
 * device/host slot, mark the session STOPPED, and record device-minute
 * usage for billing.
 */
export async function runSessionCleanup({ sessionId, reason }: DestroySessionJobData): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { emulatorInstance: { include: { computeHost: true, device: true } } },
  });
  if (!session) return;
  if (session.status === "STOPPED" || session.status === "FAILED") return;

  await prisma.session.update({ where: { id: sessionId }, data: { status: "STOPPING" } });

  if (session.emulatorInstance) {
    const { emulatorInstance } = session;
    try {
      const client = computeProviderFor(emulatorInstance.computeHost).client(emulatorInstance.computeHost);
      await client.destroyInstance(emulatorInstance.id);
    } catch (err) {
      // Host may already be gone; still reflect that the instance no longer exists.
      console.error(`Failed to destroy instance ${emulatorInstance.id} cleanly:`, err);
    }

    await prisma.emulatorInstance.update({
      where: { id: emulatorInstance.id },
      data: { status: "DESTROYED", destroyedAt: new Date() },
    });

    if (emulatorInstance.device) {
      await prisma.device.update({
        where: { id: emulatorInstance.device.id },
        data: { status: "AVAILABLE", computeHostId: null },
      });
    }
  }

  const endedAt = new Date();
  const startedAt = session.startedAt ?? session.createdAt;
  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));

  await prisma.session.update({
    where: { id: sessionId },
    data: { status: "STOPPED", endedAt, durationSeconds },
  });

  await prisma.usage.create({
    data: {
      organizationId: session.organizationId,
      sessionId: session.id,
      metricType: "DEVICE_MINUTES",
      quantity: (durationSeconds / 60).toFixed(4),
      periodStart: startedAt,
      periodEnd: endedAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "session.ended",
      targetType: "session",
      targetId: session.id,
      metadata: { reason, durationSeconds },
    },
  });

  await emitSystemEvent(sessionId, `Session stopped (${reason})`, { reason, durationSeconds }).catch(() => undefined);
}
