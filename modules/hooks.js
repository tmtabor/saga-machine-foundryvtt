import { add_effect_from_ui, evaluate_effect_variables, prompt_on_effect_deletion, remove_effect_from_ui, sync_effects,
    sync_status } from "./system/conditions.js"

/**
 * Run every time an actor is updated: Hooks.on('updateActor')
 *
 * @param {SagaMachineActor} actor
 * @param change
 * @param options
 * @param {string} id
 * @return {Promise<void>}
 */
export async function update_actor(actor, change, options, id) {
    // Add or remove Hindered consequences for encumbrance
    if (game.user.id === id && actor.type === 'character')
        await actor.encumbrance_consequences();
}

/**
 * Run every time an item is created: Hooks.on('createItem')
 *
 * @param {SagaMachineItem} item
 * @param options
 * @param {string} id
 * @return {Promise<void>}
 */
export async function create_item(item, options, id) {
    /* Calls for items */

    // Add or remove Hindered consequences for encumbrance
    if (game.user.id === id && item.parent && item.parent.type === 'character' && item.type === 'item')
        await item.parent.encumbrance_consequences();

    // If this was dragged from a container, remove the container as a parent
    if (game.user.id === id && item.parent && item.type === 'item' && item.system.parent)
        await item.remove_from_container();

    /* Calls for consequences */

    // Sync consequences with status effects
    if (game.user.id === id && item.type === "consequence" && item.parent)
        await sync_status(item.parent);
}

/**
 * Run every time an item is updated: Hooks.on('updateItem')
 *
 * @param {SagaMachineItem} item
 * @param change
 * @param options
 * @param {string} id
 * @return {Promise<void>}
 */
export async function update_item(item, change, options, id) {
    /* Calls for items */

    // Add or remove Hindered consequences for encumbrance
    if (game.user.id === id && item.parent && item.parent.type === 'character' && item.type === 'item')
        await item.parent.encumbrance_consequences();

    /* Calls for consequences */

    // Sync consequences with status effects
    if (game.user.id === id && item.type === "consequence" && item.parent)
        await sync_status(item.parent);
}

/**
 * Run every time an item is deleted: Hooks.on('deleteItem')
 *
 * @param {SagaMachineItem} item
 * @param options
 * @param {string} id
 * @return {Promise<void>}
 */
export async function delete_item(item, options, id) {
    /* Calls for items */

    // Add or remove Hindered consequences for encumbrance
    if (game.user.id === id && item.parent && item.parent.type === 'character' && item.type === 'item')
        await item.parent.encumbrance_consequences();

    /* Calls for consequences */

    // Sync consequences with status effects
    if (game.user.id === id && item.type === "consequence" && item.parent)
        await sync_status(item.parent);
}

/**
 * Run before an active effect is created: Hooks.on('preCreateActiveEffect')
 *
 * @param {ActiveEffect} effect
 * @param data
 * @param options
 * @param {string} id
 * @return {boolean}
 */
export function pre_create_active_effect(effect, data, options, id) {
    let continue_forward = true;

    // If creating an effect on an actor which came from an item, replace @ variables with correct value
    if (game.user.id === id && effect.modifiesActor && effect.parent && effect.parent.type === 'character'
        && effect.origin) evaluate_effect_variables(effect)

    return continue_forward;
}

/**
 * Run after an active effect is created: Hooks.on('createActiveEffect')
 *
 * @param {ActiveEffect} effect
 * @param options
 * @param {string} id
 * @return {Promise<void>}
 */
export async function create_active_effect(effect, options, id) {
    // If this is a status applied directly from the UI
    if (game.user.id === id && !effect.origin && effect.statuses?.size && effect.target)
        await add_effect_from_ui(effect);

    // Creating an effect on an item which belongs to an actor
    if (game.user.id === id && !effect.modifiesActor && effect.transfer && effect.parent && effect.parent.parent &&
        effect.parent.parent.type === 'character') await sync_effects(effect.parent);
}

/**
 * Run after an active effect is updated: Hooks.on('updateActiveEffect')
 *
 * @param {ActiveEffect} effect
 * @param change
 * @param options
 * @param {string} id
 * @return {Promise<void>}
 */
export async function update_active_effect(effect, change, options, id) {
    // Updating an effect on an item which belongs to an actor
    if (game.user.id === id && !effect.modifiesActor && effect.transfer && effect.parent && effect.parent.parent &&
        effect.parent.parent.type === 'character') await sync_effects(effect.parent);
}

/**
 * Run before an active effect is deleted: Hooks.on('preDeleteActiveEffect')
 *
 * @param {ActiveEffect} effect
 * @param options
 * @param {string} id
 * @return {boolean}
 */
export function pre_delete_active_effect(effect, options, id) {
    let continue_forward = true;

    // If using the status UI to delete a consequence with a subject, stop and prompt
    if (game.user.id === id && !effect.origin && effect.statuses?.size &&
        (effect?.flags?.system?.subject_prompt || effect?.flags?.system?.value_prompt))
        continue_forward &&= prompt_on_effect_deletion(effect);

    return continue_forward;
}

/**
 * Run after an active effect is deleted: Hooks.on('deleteActiveEffect')
 *
 * @param {ActiveEffect} effect
 * @param options
 * @param {string} id
 * @return {Promise<void>}
 */
export async function delete_active_effect(effect, options, id) {
    // If this is a status applied directly from the UI
    if (game.user.id === id && !effect.origin && effect.statuses?.size && effect.target)
        await remove_effect_from_ui(effect);

    // Deleting an effect on an item which belongs to an actor
    if (game.user.id === id && !effect.modifiesActor && effect.transfer && effect.parent && effect.parent.parent &&
        effect.parent.parent.type === 'character') await sync_effects(effect.parent, true);
}