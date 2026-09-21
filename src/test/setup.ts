import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

let objectUrlSeq = 0
// Node's object URL implementation cannot accept a jsdom Blob. Stub only in
// tests; production must fail rather than manufacture a non-working image URL.
URL.createObjectURL = vi.fn(() => `blob:wallet-test/${++objectUrlSeq}`)
URL.revokeObjectURL = vi.fn()
