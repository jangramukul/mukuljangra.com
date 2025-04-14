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


3. **Follow Right Architecture Patterns & Naming**
```groovy
A factory is responsible for creating objects. For example, TicketStatusFactory creates different ticket status instances. 

Utils are utility functions that provide general-purpose reusable methods, like FileUtils for handling file-related operations. 

A manager is a class that handles a specific responsibility completely, such as WebsocketManager which manages everything related to websockets. 

A provider is used to expose an API, for example, IntentProvider gives access to certain intents. 

A processor is used to handle specific logic or API processing, like WebsocketMessageProcessor which processes incoming websocket messages. 

A wrapper hides the complexity of low-level APIs and prevents direct access, such as WebsocketConnectionWrapper which wraps the connection logic. 

A repository is used to manage business logic with a focus on a single responsibility. 

A usecase represents a specific action that needs to be performed, like SendMessageUsecase which triggers the action of sending a message. 

An observer listens for changes and responds to them, for example, MessagesPagingObserver reacts to updates in message paging.
```


4. **Inline Functions**
Apply the `inline` keyword to higher-order functions to reduce runtime overhead by avoiding lambda object allocations.


5. **Stop Using Companion Objects**
Prefer Java static methods over companion object for utility functions to minimize memory usage.


6. **Safe Check & Data Validation**
Use `check()` and `requireNotNull()` for concise argument validation and early failure detection. For instance, While fetching the logged-in user from database, You could make a check for checking If user is already logged-in via check(exception..). This will ensure the safety of the caller.


7. **Lazy Initialization**
Initialize heavy objects lazily with `by lazy` to defer creation until their first use, improving launch performance. For instance, You could initialize shared preferences by lazy at higher level of activity or fragment to reduce the launch time.



