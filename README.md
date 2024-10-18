# Saga Machine Unified (FoundryVTT)

![Supported Foundry VTT versions](https://img.shields.io/badge/FoundryVTT%20Compatibility-V12-orange)
![Latest Release](https://img.shields.io/github/v/release/tmtabor/saga-machine-foundryvtt?label=Latest%20Version)

<a href="https://www.tabcreations.com/saga-machine/" target="_BLANK"><img src="https://www.tabcreations.com/media/uploads/tab/saga-machine-logo.png" alt="Saga Machine Logo" width="400"/></a>

This game system supports and enhances the play experience of [Saga Machine Unified](https://www.tabcreations.com/saga-machine/) in [Foundry Virtual Tabletop](http://foundryvtt.com/).

## Installation Instructions

Once Saga Machine Unified for Foundry Virtual Tabletop reaches its 1.0 release you will be able to install it by navigating to the **Install System** dialog on the Setup menu and installing it from there. However, until its 1.0 release, you must do a manual install.

### Install the Latest Release From Github

Open Foundry and go to Game Systems -> Install System. In the Manifest URL field at the bottom of the dialog, insert the following: `https://github.com/tmtabor/saga-machine-foundryvtt/releases/download/latest/system.json`

Alternatively, You may do this by downloading a zip archive from the [Releases Page](https://github.com/tmtabor/saga-machine-foundryvtt/releases).

### Install the Latest Development Code

If you wish to manually install the latest development code, clone this repository into the `Data/systems/saga-machine` folder using the following command: `git clone https://github.com/tmtabor/saga-machine-foundryvtt.git`. 

## Current State

Saga Machine Unified for Foundry Virtual Tabletop is currently in a "beta" state of development. The code is mostly feature complete, but merits further testing and some user interface improvements before its 1.0 release. We plan to move from Beta to 1.0 once we are satisfied with the code's stability and feature set.

**Version 0.5.0**: Beta 1. Increasingly robust feature set, but with some user interface improvements necessary.

**Version 0.4.0**: Refactoring, code cleanup and hardening ahead of its first Beta release. Foundry 12 compatibility.

**Version 0.3.0**: Mostly feature complete, albeit without extensive compendia. Foundry 11 compatibility.

## Development

Changes need to be made to the source code and then transpiled to a minified state using parcel. A run target has been added to make this easier.

> npm run build

## Notable Features

- Test margin and damage calculation that takes into account size, weapons, armor and traits.
- Inventory management with support for dragging and dropping items into containers, as well as the calculation of total encumbrance.
- Ability to edit and recalculate test results!
- Easily track Defense, Willpower, fast turns and slow turns in combat.
- Automated consequences! Just drag and drop onto the character sheet!
- Stat, skill and attack modifiers from traits and items.
- Support for stores, stashes, vehicles and mounts.
