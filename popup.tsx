import { useEffect, useRef, useState } from "react"

import { useStorage } from "@plasmohq/storage/hook"

import { generateTOTP, getRemainingTime } from "./totp"
import {
  exportToCSV,
  importFromCSV,
  normalizeSecret,
  parseOtpauthURI,
  validateSecret
} from "./utils"
import type { Account } from "./utils"

import "./popup.css"

function IndexPopup() {
  const [accounts, setAccounts] = useStorage<Account[]>("totp_accounts", [])
  const [showForm, setShowForm] = useState(false)
  const [accountName, setAccountName] = useState("")
  const [totpSecret, setTotpSecret] = useState("")
  const [codes, setCodes] = useState<Record<number, string>>({})
  const [remainingTime, setRemainingTime] = useState(getRemainingTime())
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Update TOTP codes and timer
  const updateCodes = async () => {
    if (!accounts || accounts.length === 0) return

    const newCodes: Record<number, string> = {}
    for (const account of accounts) {
      newCodes[account.id] = await generateTOTP(account.secret)
    }
    setCodes(newCodes)
    setRemainingTime(getRemainingTime())
  }

  // Set up update interval
  useEffect(() => {
    updateCodes()
    updateIntervalRef.current = setInterval(updateCodes, 1000)

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current)
      }
    }
  }, [accounts])

  // Add new account
  const addAccount = () => {
    // An otpauth:// link (what QR codes contain) carries the secret and name
    const parsed = parseOtpauthURI(totpSecret)
    const name = accountName.trim() || parsed?.name || ""
    const secret = parsed ? parsed.secret : totpSecret.trim()

    if (!name || !secret) {
      alert("Please enter both account name and TOTP secret")
      return
    }

    // Clean secret, and refuse ones that could never produce a code
    const cleanSecret = normalizeSecret(secret)
    const problem = validateSecret(cleanSecret)
    if (problem) {
      alert(`That secret doesn't look right: ${problem}.`)
      return
    }
    if (
      parsed?.warnings.length &&
      !confirm(
        `${parsed.warnings.join(". ")}.\n\nCodes may not match. Add anyway?`
      )
    ) {
      return
    }

    const newAccount: Account = {
      id: Date.now(),
      name: name,
      secret: cleanSecret
    }

    setAccounts((prev) => [...(prev || []), newAccount])
    setShowForm(false)
    setAccountName("")
    setTotpSecret("")
  }

  // Delete account
  const deleteAccount = (id: number) => {
    if (confirm("Delete this account?")) {
      setAccounts((prev) => (prev || []).filter((acc) => acc.id !== id))
    }
  }

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (err) {
      console.error("Failed to copy:", err)
      return false
    }
  }

  // Handle code click
  const handleCodeClick = async (code: string, secret: string) => {
    const success = await copyToClipboard(code)
    if (success) {
      // Visual feedback - temporarily change style
      const element = document.querySelector(`[data-secret="${secret}"]`)
      if (element) {
        element.classList.add("copied")
        setTimeout(() => {
          element.classList.remove("copied")
        }, 1000)
      }
    }
  }

  // Open Autofill settings scoped to one account
  const openAutofillSettings = (accountId: number) => {
    chrome.tabs.create({
      url: chrome.runtime.getURL(`options.html#account=${accountId}`)
    })
    window.close()
  }

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    addAccount()
  }

  // Handle Enter key in secret input
  const handleSecretKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      addAccount()
    }
  }

  // Export accounts to CSV
  const handleExport = () => {
    if (!accounts || accounts.length === 0) {
      alert("No accounts to export")
      return
    }
    exportToCSV(accounts)
  }

  // Import accounts from CSV
  const handleImport = () => {
    fileInputRef.current?.click()
  }

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const csvText = event.target?.result as string
        const importedAccounts = importFromCSV(csvText)

        if (importedAccounts.length === 0) {
          alert("No valid accounts found in CSV")
          return
        }

        // Filter out accounts with duplicate names
        const existingNames = new Set(
          (accounts || []).map((acc) => acc.name.toLowerCase())
        )
        const newAccounts = importedAccounts.filter(
          (acc) => !existingNames.has(acc.name.toLowerCase())
        )

        if (newAccounts.length === 0) {
          alert("All accounts in CSV already exist")
          return
        }

        setAccounts((prev) => [...(prev || []), ...newAccounts])
        alert(`Imported ${newAccounts.length} account(s)`)
      } catch (error) {
        alert("Error importing CSV: " + (error as Error).message)
      }
    }
    reader.readAsText(file)

    // Reset file input
    e.target.value = ""
  }

  return (
    <div className="container">
      <div className="header">
        <h1>TOTP Manager</h1>
        <div className="header-buttons">
          <button className="export-button" onClick={handleExport}>
            Export
          </button>
          <button className="import-button" onClick={handleImport}>
            Import
          </button>
          <button className="add-button" onClick={() => setShowForm(true)}>
            + Add Account
          </button>
          <button
            className="settings-button"
            title="Manage accounts & autofill"
            aria-label="Manage accounts and autofill"
            onClick={() => chrome.runtime.openOptionsPage()}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M19.14 12.94a7.1 7.1 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7 7 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7 7 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.1 7.1 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54a7 7 0 0 0 1.63-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Add Account Form */}
      {showForm && (
        <form className="add-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Account Name"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            autoFocus
          />
          <input
            type="text"
            placeholder="TOTP Secret or otpauth:// link"
            value={totpSecret}
            onChange={(e) => setTotpSecret(e.target.value)}
            onKeyDown={handleSecretKeyPress}
          />
          <div className="form-buttons">
            <button className="save-button" type="submit">
              Save
            </button>
            <button
              className="cancel-button"
              onClick={() => {
                setShowForm(false)
                setAccountName("")
                setTotpSecret("")
              }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* TOTP List */}
      <div className="totp-list">
        {!accounts || accounts.length === 0 ? (
          <div className="empty-state">
            <p>No accounts added yet</p>
            <p className="hint">Click "+ Add Account" to get started</p>
          </div>
        ) : (
          accounts.map((account) => (
            <div key={account.id} className="totp-item">
              <div className="account-info">
                <div className="account-name">
                  <span>{account.name}</span>
                  <button
                    className="edit-autofill"
                    title={`Manage ${account.name}`}
                    aria-label={`Manage ${account.name}`}
                    onClick={() => openAutofillSettings(account.id)}>
                    <svg
                      viewBox="0 0 24 24"
                      width="13"
                      height="13"
                      aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"
                      />
                    </svg>
                  </button>
                </div>
                <div
                  className="totp-code"
                  data-secret={account.secret}
                  onClick={() =>
                    handleCodeClick(
                      codes[account.id] || "------",
                      account.secret
                    )
                  }>
                  {codes[account.id] || "------"}
                </div>
                <div className="timer">
                  <div
                    className="timer-bar"
                    style={{ width: `${(remainingTime / 30) * 100}%` }}></div>
                </div>
              </div>
              <button
                className="delete-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteAccount(account.id)
                }}>
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* Hidden file input for CSV import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
    </div>
  )
}

export default IndexPopup
