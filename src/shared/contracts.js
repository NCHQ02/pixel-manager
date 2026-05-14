/**
 * Shared data contracts for OmniSignal.
 *
 * These typedefs intentionally live in vanilla ESM/JSDoc instead of TypeScript
 * so the unpacked extension can keep loading directly from source files.
 */

/**
 * @typedef {Object} Settings
 * @property {number} maxEvents
 * @property {number} sessionWindow
 * @property {number} duplicateWindow
 * @property {boolean} captureNetwork
 * @property {boolean} captureDataLayer
 * @property {boolean} captureTagScanner
 * @property {boolean} captureDiagnostics
 * @property {boolean} restoreWorkspace
 * @property {boolean} autoSaveWorkspace
 * @property {string} defaultView
 * @property {string} defaultPlatformFilter
 * @property {string} defaultStatusFilter
 * @property {boolean} defaultSessionView
 * @property {boolean} compactEvents
 * @property {boolean} autoOpenPayload
 * @property {boolean} reportIncludeDiagnostics
 * @property {boolean} reportIncludePayloads
 * @property {string} rawExportScope
 * @property {Record<string, string>} expectedPixels
 * @property {{platform: string, eventName: string}[]} expectedEvents
 */

/**
 * @typedef {Object} TrackedEvent
 * @property {string} id
 * @property {string} tabId
 * @property {string} platform
 * @property {string} pixelId
 * @property {string} eventName
 * @property {Record<string, any>} eventData
 * @property {string} url
 * @property {string} [pixelUrl]
 * @property {string} method
 * @property {number} timestamp
 * @property {string} status
 * @property {boolean} isDiagnostic
 * @property {string[]} issues
 * @property {number} duplicateCount
 * @property {string} auditRunId
 * @property {"network"|"datalayer"|"scanner"} source
 * @property {"local_network"|"local_datalayer"|"local_scanner"|"external_account"} [evidenceSource]
 * @property {number} [parserSchemaVersion]
 * @property {"high"|"medium"|"low"} [confidence]
 * @property {string} [sourceParser]
 * @property {Record<string, any>} [diagnostics]
 * @property {string} [dedupeKey]
 * @property {string} [payloadHash]
 */

/**
 * @typedef {Object} ParsedSignal
 * @property {string} platform
 * @property {string} pixelId
 * @property {string} eventName
 * @property {Record<string, any>} eventData
 * @property {boolean} isDiagnostic
 * @property {"high"|"medium"|"low"} confidence
 * @property {Record<string, any>} diagnostics
 * @property {string} sourceParser
 * @property {number} parserSchemaVersion
 */

/**
 * @typedef {Object} AuditIssue
 * @property {"error"|"warning"|"info"} severity
 * @property {"installation"|"event_quality"|"required_params"|"deduplication"|"consent"|"google_tag_health"|"privacy"|"duplicate_firing"|"parser_confidence"|"source_of_truth"} category
 * @property {string} platform
 * @property {string} eventName
 * @property {string} pixelId
 * @property {string} message
 * @property {string} evidence
 * @property {string} suggestion
 * @property {"network"|"datalayer"|"scanner"|"audit"} source
 * @property {"local_network"|"local_datalayer"|"local_scanner"|"external_account"} [evidenceSource]
 * @property {?string} eventId
 * @property {number} timestamp
 * @property {boolean} [heuristic]
 */

/**
 * @typedef {Object} AuditRun
 * @property {string} id
 * @property {string} tabId
 * @property {string} domain
 * @property {string} url
 * @property {number} startedAt
 * @property {?number} endedAt
 * @property {string} reloadMode
 * @property {Record<string, string>} expectedPixels
 * @property {{platform: string, eventName: string}[]} expectedEvents
 */

/**
 * @typedef {Object} AuditTabContext
 * @property {string} tabId
 * @property {string} auditRunId
 * @property {string} url
 * @property {string} hostname
 * @property {number} startedAt
 * @property {string} reloadMode
 * @property {boolean} startedAfterLoad
 * @property {"full"|"network_only"|"blocked"} [activationMode]
 * @property {boolean} [contentInjected]
 * @property {boolean} [mainWorldInjected]
 * @property {string} [activationError]
 * @property {string[]} [activationWarnings]
 */

/**
 * @typedef {Object} DashboardState
 * @property {string} activeView
 * @property {string} searchQuery
 * @property {string} platformFilter
 * @property {string} statusFilter
 * @property {string} selectedTabId
 * @property {boolean} isSessionView
 * @property {?string} selectedEventId
 * @property {{platform: string, pixelId: string}[]} selectedTagFilters
 * @property {?{platform: string, eventName: string}} selectedTimelineFilter
 * @property {Record<string, string>} expectedPixels
 * @property {{platform: string, eventName: string}[]} expectedEvents
 */

/**
 * @typedef {Object} EventRepository
 * @property {() => Promise<void>} init
 * @property {(event: TrackedEvent, options?: {maxEvents?: number}) => Promise<void>} addEvent
 * @property {(events: TrackedEvent[], options?: {maxEvents?: number}) => Promise<void>} addEvents
 * @property {(match: Partial<TrackedEvent>, eventData?: Record<string, any>) => Promise<?TrackedEvent>} incrementDuplicateEvent
 * @property {() => Promise<Record<string, TrackedEvent[]>>} getEventsMap
 * @property {() => Promise<TrackedEvent[]>} getAllEvents
 * @property {(tabId: string) => Promise<TrackedEvent[]>} getEventsByTab
 * @property {(tabId: string, options?: {includeDiagnostics?: boolean}) => Promise<number>} countEventsForTab
 * @property {(tabId: string) => Promise<void>} clearEventsForTab
 * @property {(tabId: string, cutoffTimestamp: number) => Promise<void>} clearEventsForTabBefore
 * @property {(maxEvents: number) => Promise<boolean>} trimEventsToMax
 * @property {(run: AuditRun) => Promise<void>} putAuditRun
 * @property {(id: string, patch: Partial<AuditRun>) => Promise<void>} patchAuditRun
 * @property {() => Promise<Record<string, AuditRun>>} getAuditRunsMap
 * @property {() => Promise<void>} clearAll
 * @property {(storageArea: chrome.storage.StorageArea) => Promise<void>} migrateLegacyStorage
 */

export {};
