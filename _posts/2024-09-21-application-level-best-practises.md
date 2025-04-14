---
title: Application Level Best Practises
layout: post
categories: post
tags:
  - Android
  - Best Practices
---

1. **Use App Startup for Initialization**
The App Startup library simplifies application-level initialization by centralizing component setup. Instead of relying on base application (which add overhead and cause slow app launch), App Startup allows you to define initializers, reducing startup time and improving efficiency.


2. **Pending Actions In Offline-First Architecture**
Design your app to work offline by default. Use a local database i.e Room, SQLDelight etc. to store pending actions (e.g., unsent messages) and sync with the server when the network is available. Libraries like Store simplify caching and data synchronization, ensuring seamless offline functionality.


3. **WorkManager for Background Tasks**
For tasks like sending messages, syncing data, downloading files, use WorkManager from Jetpack libraries. It handles compatibility across Android versions, respects battery life, guarantee the execution of tasks. Use Services like Background or foreground services for long running operations i.e location tracking, websocket service etc.


4. **Thread Safety & Locks**
In order to prevent race conditions with concurrency like `Mutex`, single-thread executors, or object locks. These ensure thread-safe access to shared resources like databases, resources etc. For instance, fetching the database.


5. **Use WeakReference & Prevent Memory Leaks**
Use `WeakReference` when holding activity or context references in long-lived objects (e.g., singletons) and clear them manually when unused. This prevents memory leaks by allowing the garbage collector to reclaim unused resources.


6. **Loading Images & Optimize Assets**
Use SVG images instead of PNG/JPG for vector-based graphics. SVGs scale without losing quality and reduce APK size.


7. **Cache Expiry**
To check if cached data is outdated, developers often use two methods. The first method involves comparing the ETag (a unique identifier provided by the server) stored locally with the server’s current ETag. If they don’t match, the cached data is considered expired and needs to be refreshed. The second method relies on tracking the last-modified-date for each entity. If the server’s last-modified-date for that entity is newer than the one stored locally, the cache is invalid, and the app should fetch and save the updated data. Both approaches help minimize unnecessary network requests and ensure efficient data synchronization.


8. **Follow Law of Demeter**
In OOP, It's a good practice for objects to work with high-level APIs instead of directly accessing low-level components. This approach keeps the API modular and easier to manage. Take the example of three classes: Car, Engine, and Power. In this design, the Power class should not access the Engine or Car classes. The Car class is allowed to interact with the Engine, and the Engine can interact with Power. However, the Car should not directly access Power, and the Engine should not access the Car.


