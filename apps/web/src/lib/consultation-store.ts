"use client"

import { loadSecureItem, saveSecureItem } from "@storage/secure-storage"
import type { PatientSession, StoredConsultation } from "./consultation-types"

const PATIENT_SESSION_KEY = "vaidhya_active_patient"
const CONSULTATION_RESULT_KEY = "vaidhya_active_consultation"
const AUDIO_DB_NAME = "vaidhya_ai_audio_db"
const AUDIO_STORE_NAME = "recordings"
const AUDIO_RECORD_KEY = "latest_consultation_audio"

export async function saveActivePatient(session: PatientSession): Promise<void> {
  await saveSecureItem(PATIENT_SESSION_KEY, session)
}

export async function loadActivePatient(): Promise<PatientSession | null> {
  return loadSecureItem<PatientSession>(PATIENT_SESSION_KEY)
}

export async function saveActiveConsultation(data: StoredConsultation): Promise<void> {
  await saveSecureItem(CONSULTATION_RESULT_KEY, data)
}

export async function loadActiveConsultation(): Promise<StoredConsultation | null> {
  return loadSecureItem<StoredConsultation>(CONSULTATION_RESULT_KEY)
}

function openAudioDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"))
      return
    }
    const request = window.indexedDB.open(AUDIO_DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"))
  })
}

export async function saveConsultationAudioBlob(blob: Blob): Promise<void> {
  try {
    const db = await openAudioDatabase()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE_NAME, "readwrite")
      const store = tx.objectStore(AUDIO_STORE_NAME)
      store.put(blob, AUDIO_RECORD_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error("Failed to save audio blob"))
    })
    db.close()
  } catch (error) {
    console.warn("[consultation-store] unable to persist audio blob in IndexedDB:", error)
  }
}

export async function loadConsultationAudioBlob(): Promise<Blob | null> {
  try {
    const db = await openAudioDatabase()
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE_NAME, "readonly")
      const store = tx.objectStore(AUDIO_STORE_NAME)
      const req = store.get(AUDIO_RECORD_KEY)
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null)
      req.onerror = () => reject(req.error ?? new Error("Failed to read audio blob"))
    })
    db.close()
    return blob
  } catch {
    return null
  }
}

export async function clearConsultationAudioBlob(): Promise<void> {
  try {
    const db = await openAudioDatabase()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(AUDIO_STORE_NAME, "readwrite")
      tx.objectStore(AUDIO_STORE_NAME).delete(AUDIO_RECORD_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
  } catch {
    // Ignore cleanup errors
  }
}
