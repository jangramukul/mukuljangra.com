---
title: "Android Activity Lifecycle — Top Interview Questions"
date: 2026-02-13
layout: interview
tags: [Technical Round, Android]
---

## Android Activity Lifecycle — What Interviewers Really Ask

The Activity lifecycle is one of the most frequently asked topics in Android interviews at companies like Google, Meta, and Amazon. Here's what you need to know.

### 🔑 Key Concepts

**Q1: What are the Activity lifecycle callbacks in order?**

`onCreate()` → `onStart()` → `onResume()` → *(running)* → `onPause()` → `onStop()` → `onDestroy()`

**Q2: What happens when you rotate the device?**

The Activity is destroyed and recreated. The sequence is:
`onPause()` → `onStop()` → `onSaveInstanceState()` → `onDestroy()` → `onCreate()` → `onStart()` → `onRestoreInstanceState()` → `onResume()`

You should save transient UI state in `onSaveInstanceState()` and restore it in `onCreate()` or `onRestoreInstanceState()`.

**Q3: What's the difference between `onStop()` and `onPause()`?**

- `onPause()` — Activity is partially visible (e.g., a dialog covers it). Keep it lightweight — don't do heavy work here.
- `onStop()` — Activity is no longer visible at all. Release resources that aren't needed while hidden.

**Q4: When is `onDestroy()` NOT called?**

If the system kills the process to reclaim memory, `onDestroy()` is not guaranteed to be called. That's why you should never rely on it for saving critical data — use `onStop()` or `onSaveInstanceState()` instead.

**Q5: How does `ViewModel` survive configuration changes?**

`ViewModel` is stored in a `ViewModelStore` associated with the Activity's `NonConfigurationInstances`. When the Activity is destroyed due to configuration change, the `ViewModelStore` is retained and reattached to the new Activity instance.

### 💡 Common Follow-ups

- What's the difference between `finish()` and pressing the back button?
- How does `onSaveInstanceState()` differ from `ViewModel` for state preservation?
- What happens to the lifecycle when Activity A launches Activity B?
- How do `Fragments` interact with the Activity lifecycle?

### ✅ Tips for the Interview

1. **Draw the lifecycle diagram** on paper — interviewers love visual explanations
2. **Know the edge cases** — multi-window mode, picture-in-picture, process death
3. **Connect it to Jetpack** — explain how `Lifecycle`, `LiveData`, and `ViewModel` relate to lifecycle callbacks
4. **Mention testing** — `ActivityScenario` from the testing library lets you drive lifecycle state changes in tests

---

*Practice explaining these out loud — interviews test communication as much as knowledge.*
