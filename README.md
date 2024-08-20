# Saga Machine Unified (FoundryVTT)

![Supported Foundry VTT versions](https://img.shields.io/badge/FoundryVTT%20Compatibility-V11-orange)
![Latest Release](https://img.shields.io/github/v/release/tmtabor/saga-machine-foundryvtt?label=Latest%20Version)

<a href="https://www.tabcreations.com/saga-machine/" target="_BLANK"><img src="https://www.tabcreations.com/media/uploads/tab/saga-machine-logo.png" alt="Saga Machine Logo" width="400"/></a>

This game system supports and enhances the play experience of [Saga Machine Unified](https://www.tabcreations.com/saga-machine/) in [Foundry Virtual Tabletop](http://foundryvtt.com/).

## Installation Instructions

Once Saga Machine Unified for Foundry Virtual Tabletop reaches its 1.0 release you will be able to install it by navigating to the **Install System** dialog on the Setup menu and installing it from there. However, until its 1.0 release, you must do a manual install.

If you wish to manually install the system, extract it into the `Data/systems/saga-machine` folder. You may do this by downloading a zip archive from the [Releases Page](https://github.com/tmtabor/saga-machine-foundryvtt/releases).

## Current State

Saga Machine Unified for Foundry Virtual Tabletop is currently in an "advanced alpha" state of development. The code is mostly feature complete, but merits some refactoring ahead of its first Beta release. We plan to move from Alpha to Beta shortly after the system has been verified with the upcoming Foundry 12.

**Version 0.4.0**: Ongoing refactoring, code cleanup and hardening ahead of its first Beta release.

**Version 0.3.0**: Mostly feature complete, albeit without extensive compendia.

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
