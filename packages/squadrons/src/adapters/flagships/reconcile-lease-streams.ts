/** Management and flagship watches reconcile the same one-stream-per-lease lifecycle. */
interface LeaseStream { crewToken: string; stop: () => void }

export function reconcileLeaseStreams<Key>(options: {
  watched: Map<Key, LeaseStream>;
  leases: readonly { key: Key; crewToken: string }[];
  start: (key: Key, crewToken: string) => LeaseStream;
}): void {
  for (const [key, stream] of options.watched) {
    if (!options.leases.some((lease) => lease.key === key && lease.crewToken === stream.crewToken)) {
      stream.stop();
      options.watched.delete(key);
    }
  }
  for (const lease of options.leases) {
    if (!options.watched.has(lease.key)) {
      options.watched.set(lease.key, options.start(lease.key, lease.crewToken));
    }
  }
}
