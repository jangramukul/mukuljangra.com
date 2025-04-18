---
title: Gradle Build Process Guide
layout: post
categories: post

tags:
  - Android
  - Gradle

---
Gradle is a open source build automation tool that is designed to be flexible enough to build almost any type of software with certain defined configurations. Gradle uses groovy language to run and build the software. Now days gradle also supports kotlin. It means you able to run kotlin code for gradle. In Android, Android studio use Gradle to manage the build process with some certain build configurations which allows you to build apks or bundle by compile the app resources or source code.


**The Build Process**

The Build Process involves many tools and processes to convert the project into Android Application Package (APK) or Android App Bundle (AAB). Under the hood, The compiler compiles the app source code and convert them into DEX (Dalvik Executable) files. Later, The Packager combines the DEX files and compiled resources into an APK or AAB, depending on the chosen build target. The packager uses the zipalign tool to optimize your app to use less memory when running on a device. Gradle build process use scripts defined with some certain build configurations like build target, product flavours etc.


**A Gradle build has three distinct phases:**

Initialization : Gradle supports single or multiple project builds. In this phase, Gradle determines which projects are going to take part in build process. During initialization, gradle look for settings.gradle file in root project, Gradle checks if the current project is part of the multi-project hierarchy defined in the found settings.gradle file. If not, the build is executed as a single project build. Otherwise a multi-project build is executed. Gradle creates project object based on initilization phase process.

Configuration : In this phase, Gradle determines which configurations are going to invoke in build process. It use build.gradle.kts.

Execution : In this phase, Gradle start build process with some sort of configurations of projects.


**The Gradle Plugins**

Gradle plugins plays a important role in gradle build process. Plugins add some defined tasks or objects to respective build scripts. In multi-module projects, we might need to share common code between gradle scripts or providing some short of configurations. Plugins do it in better way.

In general, Plugins has two types — Binary and scripts plugins.

Binary Plugins : Binary plugins are written in Gradle’s DSL languages. These plugins are used with build scripts or project hierarchy to add some extra tasks. Generally, these are created by implementing Plugin interface.

Script Plugins : Script plugins are are additional build scripts used for manipulating the build process.


Thank You!






