# Running real Android Emulators (Linux + KVM)

`EMULATOR_PROVIDER=real` makes `services/emulator-worker` spawn actual
`emulator`/`adb`/`avdmanager` processes. This only works on a Linux host with
hardware virtualization. It will not work in this repo's default dev setup
(macOS has no KVM), which is exactly why `MockEmulatorProvider` exists.

## 1. Confirm hardware virtualization is available

```bash
# Should print > 0
egrep -c '(vmx|svm)' /proc/cpuinfo

# After installing qemu-kvm (below), confirm KVM is usable:
kvm-ok   # Ubuntu/Debian: apt install cpu-checker
```

On a cloud VM, this means a bare-metal instance or one with nested
virtualization explicitly enabled (e.g. AWS `.metal` instance types, or GCP
with `--enable-nested-virtualization` on an instance that supports it).

## 2. Install KVM + give the worker process access

```bash
sudo apt-get update
sudo apt-get install -y qemu-kvm libvirt-daemon-system
sudo usermod -aG kvm $USER   # re-login after this
ls -l /dev/kvm                # should exist and be group `kvm`
```

## 3. Install the Android SDK command-line tools

```bash
export ANDROID_SDK_ROOT=/opt/android-sdk
sudo mkdir -p $ANDROID_SDK_ROOT/cmdline-tools
curl -o /tmp/cmdline-tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
sudo unzip /tmp/cmdline-tools.zip -d $ANDROID_SDK_ROOT/cmdline-tools
sudo mv $ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools $ANDROID_SDK_ROOT/cmdline-tools/latest

yes | $ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager --licenses
$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager \
  "platform-tools" \
  "emulator" \
  "system-images;android-33;google_apis;x86_64" \
  "system-images;android-34;google_apis;x86_64" \
  "system-images;android-35;google_apis;x86_64"
```

Install a system image for every `device_profiles.emulator_image` value you
plan to serve (see `packages/database/prisma/seed.ts` for the seeded list).
ARM64 images (`arm64-v8a`) are only meaningfully hardware-accelerated on
ARM64 hosts - stick to `x86_64` images on x86_64 hosts.

## 4. Point the worker at the SDK and run it in real mode

```bash
export ANDROID_SDK_ROOT=/opt/android-sdk
export EMULATOR_DATA_ROOT=/var/lib/devicefarm/emulators
export EMULATOR_PROVIDER=real
sudo mkdir -p $EMULATOR_DATA_ROOT && sudo chown $USER $EMULATOR_DATA_ROOT

pnpm --filter @devicefarm/emulator-worker run dev
```

## 5. Register the host

From an account with `is_platform_admin=true`, either use `/admin` in the
frontend ("Add compute host") or:

```bash
curl -X POST http://localhost:4000/api/admin/compute-hosts \
  -H 'content-type: application/json' -b 'token=<your JWT>' \
  -d '{
    "name": "gpu-box-1",
    "providerType": "LOCAL",
    "hostname": "10.0.0.5",
    "cpuCapacityMillicores": 16000,
    "ramCapacityMb": 32768,
    "diskCapacityMb": 512000,
    "maxConcurrentEmulators": 6,
    "kvmEnabled": true,
    "workerPort": 4200
  }'
```

The heartbeat loop in `device-orchestrator` marks it `HEALTHY` once it can
reach `http://<hostname>:<workerPort>/capacity`.

## 6. (Optional) Golden snapshots for fast resets

The MVP's `resetToCleanSnapshot` recreates the AVD from scratch, which is
correct but slow (a full boot). For production-grade reset speed, bake a
"golden" AVD once per device profile (create it, boot it, let it settle,
shut it down) and have `real-android-provider.ts`'s `createAvd` copy that
directory (or, better, use qcow2 backing files so instance disks are
copy-on-write deltas) instead of running `avdmanager create avd` on every
session. This is called out as a TODO in
`services/emulator-worker/src/providers/real-android-provider.ts`.

## Multiple emulators per host

`allocateConsolePort` (`emulator-worker/src/adb.ts`) hands out ports from
5554-5682 in pairs, so a single worker process can run dozens of concurrent
instances as long as the host has the CPU/RAM/disk for them - the scheduler
(`services/scheduler`) is what actually caps concurrency per host via
`compute_hosts.max_concurrent_emulators`.
