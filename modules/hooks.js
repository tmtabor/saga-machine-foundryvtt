/**
 * Handlebars library - used by Foundry VTT
 *
 * @external Handlebars
 * @link https://handlebarsjs.com/api-reference/
 */

/**
 * Register a Handlebars helper
 *
 * @function Handlebars.registerHelper
 * @link https://handlebarsjs.com/api-reference/
 */

/**
 * Register Handlebars helpers and partials
 */
Hooks.once("init", async () => {
	// Register handlebars helpers
	Handlebars.registerHelper("is_GM", () => game.user.isGM);
	Handlebars.registerHelper("is_weapon", item => item.system.group.toLowerCase() === 'weapons');
	Handlebars.registerHelper("is_wearable",
			item => item.system.group.toLowerCase() === 'armors' || item.system.group.toLowerCase() === 'apparel');

	// Register handlebars partials
	await loadTemplates([
		'systems/saga-machine/templates/partials/character-header.html',
		'systems/saga-machine/templates/partials/character-sidebar.html',
		'systems/saga-machine/templates/partials/character-inventory.html'
	]);
});

/**
 * Run every time an actor is updated
 */
Hooks.on('updateActor', async (actor, change, options, id) => {
    // Add or remove Hindered consequences for encumbrance
    if (game.user.id === id && actor.type === 'character')
        await actor.encumbrance_consequences();
});

/**
 * Run every time an item is created
 */
Hooks.on('createItem', async (item, options, id) => {
    // Add or remove Hindered consequences for encumbrance
    if (game.user.id === id && item.parent && item.parent.type === 'character' && item.type === 'item')
        await item.parent.encumbrance_consequences();

    // If this was dragged from a container, remove the container as a parent
    if (game.user.id === id && item.parent && item.type === 'item' && item.system.parent)
        await item.update({ 'system.parent': null });
});

/**
 * Run every time an item is updated
 */
Hooks.on('updateItem', async (item, change, options, id) => {
    // Add or remove Hindered consequences for encumbrance
    if (game.user.id === id && item.parent && item.parent.type === 'character' && item.type === 'item')
        await item.parent.encumbrance_consequences();
});

/**
 * Run every time an item is deleted
 */
Hooks.on('deleteItem', async (item, options, id) => {
    // Add or remove Hindered consequences for encumbrance
    if (game.user.id === id && item.parent && item.parent.type === 'character' && item.type === 'item')
        await item.parent.encumbrance_consequences();
});
