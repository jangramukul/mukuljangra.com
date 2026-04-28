---
title: Follow Right Architecture Patterns Naming
categories: post
tags:
  - Android
  - Architecture
---

This explores common naming patterns used in software architecture and explains their purposes. Each pattern serves a specific role in creating maintainable and well-structured code. Understanding these patterns helps developers choose appropriate names that clearly communicate a component's responsibility.

```
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


Thank You!










