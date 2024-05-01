import { SagaMachineActor } from "./actor/actor.js";
import { CharacterSheet, StashSheet, VehicleSheet } from "./actor/actor-sheet.js";
import { SMCombatTracker } from "./system/combat.js";
import { generate_conditions } from "./system/conditions.js";
import { SagaMachineItem } from "./item/item.js";
import { SagaMachineItemSheet } from "./item/item-sheet.js";
import { sm_test_macro } from "./system/tests.js";
import { create_active_effect, create_item, delete_active_effect, delete_item, pre_create_active_effect,
    pre_delete_active_effect, update_active_effect, update_actor, update_item } from "./hooks.js";

// Turn on debugging
CONFIG.debug.hooks = true;

/**
 * Init hook.
 */
Hooks.once("init", async () => {
    console.log(`Initializing Saga Machine`);

    // Add classes to global game variable
    game.sagamachine = {
        SagaMachineActor,
        SagaMachineItem,
        sm_test_macro
    };

    // Define custom document classes
    CONFIG.Actor.documentClass = SagaMachineActor;
    CONFIG.Item.documentClass = SagaMachineItem;
    CONFIG.ui.combat = SMCombatTracker

    // Unregister the core sheets
    Actors.unregisterSheet("core", ActorSheet);
    Items.unregisterSheet("core", ItemSheet);

    // Register Saga Machine sheet classes
    Actors.registerSheet("saga-machine", CharacterSheet, { types: ["character"], makeDefault: true });
    Actors.registerSheet("saga-machine", StashSheet, { types: ["stash"], makeDefault: true });
    Actors.registerSheet("saga-machine", VehicleSheet, { types: ["vehicle"], makeDefault: true });
    Items.registerSheet("saga-machine", SagaMachineItemSheet, { makeDefault: true });

    // Register custom status effects
    CONFIG.statusEffects = generate_conditions();
    CONFIG.specialStatusEffects.DEFEATED = 'defeated';
    CONFIG.specialStatusEffects.INCAPACITATED = 'unconscious';
    CONFIG.specialStatusEffects.INVISIBLE = 'hidden'
    game.sagamachine.standard_consequences = CONFIG.statusEffects.map(s => s.name);

    // Register hooks
    Hooks.on('updateActor', update_actor);

    Hooks.on('createItem', create_item);
    Hooks.on('updateItem', update_item);
    Hooks.on('deleteItem', delete_item);

    Hooks.on('preCreateActiveEffect', pre_create_active_effect);
    Hooks.on('createActiveEffect', create_active_effect);
    Hooks.on('updateActiveEffect', update_active_effect);
    Hooks.on('preDeleteActiveEffect', pre_delete_active_effect);
    Hooks.on('deleteActiveEffect', delete_active_effect);

    // Register system config
    game.settings.register('saga-machine', 'level', {
        name: 'Starting Power Level',
        hint: 'The starting power level of all player characters.',
        scope: 'world',
        config: true,
        type: Number,
        default: 120,
        choices: {
            85: "Mundane",
            120: "Novice",
            160: "Exceptional",
            200: "Distinguished",
            240: "Renowned",
            280: "Legendary"
        }
    });
});
