---
title: Best Practises at ViewModel Level
layout: post
categories: post
tags:
  - Android
  - Best Practices
---

1. **Resource Management**
Use the use() function for resources like files or databases to ensure automatic closure, even if an exception occurs. This will help in prevent the memory leaks and close the FileDescriptors which is unused to work.


2. **Catching Exceptions**
As a rule of thumb, catching exceptions should be handled at the top level codebase, not the low level APIs. If any API throws or uses exceptions for conditions, not for logical errors, It would be better to create a wrapper function and convert its exceptions into appropriate values. If you’re only interested in success or failure result, prefer returning null indicating the failure. In case of multiple errors, prefer sealed classes. Conditions exception is where we throw an exception based on certain conditions like if else etc. Logical exceptions are where we throw an exception based on logical code.

3. **Inline Functions**
Apply the `inline` keyword to higher-order functions to reduce runtime overhead by avoiding lambda object allocations.


4. **Stop Using Companion Objects**
Prefer Java static methods over companion object for utility functions to minimize memory usage.


5. **Safe Check & Data Validation**
Use `check()` and `requireNotNull()` for concise argument validation and early failure detection. For instance, While fetching the logged-in user from database, You could make a check for checking If user is already logged-in via check(exception..). This will ensure the safety of the caller.


6. **Lazy Initialization**
Initialize heavy objects lazily with `by lazy` to defer creation until their first use, improving launch performance. For instance, You could initialize shared preferences by lazy at higher level of activity or fragment to reduce the launch time.



