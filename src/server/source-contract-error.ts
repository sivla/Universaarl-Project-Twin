export const adapterErrorCodes = [
  'QUELLKONFIGURATION_UNGUELTIG',
  'QUELLVERTRAG_UNGUELTIG',
  'GIT_QUELLE_NICHT_VERFUEGBAR',
  'QUELLE_WAEHREND_LESEN_GEAENDERT',
] as const;

export type AdapterErrorCode = typeof adapterErrorCodes[number];

export class AdapterSourceError extends Error {
  constructor(readonly code: AdapterErrorCode, message: string) {
    super(message);
    this.name = 'AdapterSourceError';
  }
}
