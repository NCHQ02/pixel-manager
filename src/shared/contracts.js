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
 * @property {number} [parserSchemaVersion]
 */

/**
 * @typedef {Object} AuditIssue
 * @property {"error"|"warning"|"info"} severity
 * @property {"installation"|"event_quality"|"required_params"|"deduplication"|"consent"|"google_tag_health"|"privacy"|"duplicate_firing"|"parser_confidence"} category
 * @property {string} platform
 * @property {string} eventName
 * @property {string} pixelId
 * @property {string} message
 * @property {string} evidence
 * @property {string} suggestion
 * @property {"network"|"datalayer"|"scanner"|"audit"} source
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
 * @property {(maxEvents: number) => Promise<boolean>} trimEventsToMax
 * @property {(run: AuditRun) => Promise<void>} putAuditRun
 * @property {(id: string, patch: Partial<AuditRun>) => Promise<void>} patchAuditRun
 * @property {() => Promise<Record<string, AuditRun>>} getAuditRunsMap
 * @property {() => Promise<void>} clearAll
 * @property {(storageArea: chrome.storage.StorageArea) => Promise<void>} migrateLegacyStorage
 */

export {};
