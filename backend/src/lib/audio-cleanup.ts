import { cleanupExpiredRecordings, cleanupIncompleteSessions } from './audio-archive';
import { cleanupOrphanRecordingArchives } from './recording-orphan-cleanup';
import { STORAGE_CONFIG } from './storage-config';

export function startAudioCleanup(): void {
  const incompleteIntervalMs =
    STORAGE_CONFIG.incompleteAudioCleanupIntervalHours * 60 * 60 * 1000;
  const retentionIntervalMs = STORAGE_CONFIG.audioCleanupIntervalHours * 60 * 60 * 1000;

  const runIncomplete = () => {
    const count = cleanupIncompleteSessions();
    if (count > 0) {
      console.log(
        `[AudioCleanup] Removed ${count} incomplete session(s) (retention ${STORAGE_CONFIG.incompleteAudioRetentionDays}d)`
      );
    }
  };

  const runExpired = () => {
    const count = cleanupExpiredRecordings();
    if (count > 0) {
      console.log(
        `[AudioCleanup] Removed ${count} expired recording(s) (retention ${STORAGE_CONFIG.audioRetentionDays}d)`
      );
    }
  };

  const runOrphans = () => {
    void cleanupOrphanRecordingArchives().then((r) => {
      if (r.removed > 0) {
        console.log(`[AudioCleanup] Removed ${r.removed} orphan recording dir(s)`);
      }
    });
  };

  runIncomplete();
  runExpired();
  runOrphans();
  setInterval(runIncomplete, incompleteIntervalMs);
  setInterval(runExpired, retentionIntervalMs);
  setInterval(runOrphans, incompleteIntervalMs);

  console.log(
    `[AudioCleanup] Incomplete scan every ${STORAGE_CONFIG.incompleteAudioCleanupIntervalHours}h (${STORAGE_CONFIG.incompleteAudioRetentionDays}d); complete retention scan every ${STORAGE_CONFIG.audioCleanupIntervalHours}h (${STORAGE_CONFIG.audioRetentionDays}d)`
  );
}
