import { test_dialog } from "../game/tests.js";
import { ActionHelper, SagaMachineItem } from "../item/item.js";

/**
 * ActorSheet context used in getData() and dependent methods.
 *
 * @typedef {{cssClass: string, editable: *, document: *, data: *, limited: *, options: *, owner: *, title: *}} Context
 */

/**
 * JQuery library - used by Foundry VTT
 *
 * @external JQuery
 * @link https://api.jquery.com/
 */

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
 * Register Handlebars helpers and partials: Hooks.once('init')
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
 * The following constants were moved from the templates to code due to deprecations in Foundry 12
 */

/**
 * Used to build the lifestyle dropdown in the character inventory
 */
export const LIFESTYLES = {
	'Broke': 'Broke',
	'Poor': 'Poor',
	'Struggling': 'Struggling',
	'Average': 'Average',
	'Comfortable': 'Comfortable',
	'Wealthy': 'Wealthy',
	'Very Wealthy': 'Very Wealthy',
	'Filthy Rich': 'Filthy Rich'
};

/**
 * Used to build the type dropdown on the Stash sheet
 */
export const STASH_TYPES = {
	'Stash': 'Stash',
	'Merchant': 'Merchant',
};

/**
 * Used to build the availability dropdown on the Vehicle sheet
 */
export const VEHICLE_AVAILABILITY = {
	'common': 'Common',
	'uncommon': 'Uncommon',
	'rare': 'Rare',
	'exotic': 'Exotic'
};

/**
 * Used to build the handling dropdown on the Vehicle sheet
 */
export const VEHICLE_HANDLING = {
	'++': '⊕⊕',
	'+': '⊕',
	'': '—',
	'-': '⊖',
	'--': '⊖⊖'
};

/**
 * Extend Foundry's ActorSheet with modifications to support the Saga Machine system.
 * This is a base class that's meant to be extended for specific actor types.
 */
export class SagaMachineActorSheet extends ActorSheet {

	/**********************************
	 * METHODS THAT SET BASIC OPTIONS *
	 **********************************/

	/**
	 * The default options for actor sheets
	 *
	 * @override
	 * @returns {DocumentSheetOptions}
	 * */
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["saga-machine", "sheet", "actor"],
			width: 850,
			height: 650,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "basics"}],
			scrollY: [".basics", ".combat", ".inventory", ".advancement"],
			dragDrop: [{dragSelector: ".items-list .item", dropSelector: null}]
		});
	}

	/**
	 * Dynamically set the HTML template for the actor based on type
	 *
	 * @returns {string}
	 */
	get template() {
		return `systems/saga-machine/templates/actors/${this.actor.type}-sheet.html`;
	}

	/**********************************
	 * METHODS THAT HANDLE SHEET DATA *
	 **********************************/

	/**
	 * @inheritdoc
	 * @override
	 * @return Context
	 * */
	getData() {
		const context = super.getData();

		// Filter and sort all item lists for the character
		context.data.system.ambitions = this.items(context, 'ambition', null,
			(a, b) => a.system.type > b.system.type ? 1 : -1);
		context.data.system.paths = this.items(context, 'path');
		context.data.system.origins = this.items(context, 'origin');
		context.data.system.all_skills = this.items(context, 'skill');
		context.data.system.skill_groups = this.skills_and_traits(context.data.system.all_skills, 'General Skills');
		context.data.system.all_traits = this.items(context, 'trait');
		context.data.system.trait_groups = this.skills_and_traits(context.data.system.all_traits, 'General Traits', ['General Traits', 'Weaknesses']);
		context.data.system.consequences = this.items(context, 'consequence');
		context.data.system.equipment = this.items(context, 'item');
		context.data.system.containers = this.items(context, 'item', i => !!i.system.container);

		return context;
	}

	/**
	 * Get all items of the specified type, apply an optional secondary filter and sort (alphabetically by default).
	 *
	 * @param {Context} context - Context produced in getData()
	 * @param {string} type - Item type (e.g. 'skill', 'trait', 'consequence')
	 * @param {Function} [filter] - Optional filtering function
	 * @param {Function} [sort] - Optional sorting function
	 * @returns {SagaMachineItem[]}
	 */
	items(context, type, filter, sort) {
		if (!filter) filter = () => true;
		if (!sort) sort = (a, b) => a.name > b.name ? 1 : -1;
		return context.actor.items.filter(item => item.type === type && filter(item)).sort(sort);
	}

	/**
	 * Organize skill or trait items into groups
	 *
	 * @param {SagaMachineItem[]} all_items - Items to be organized
	 * @param {string} default_group - Default group for new items or those without a specified group
	 * @param {string[]} display_if_empty - Groups to create even if they are empty
	 * @return {{name: string, contents: SagaMachineItem[]}[]}
	 * @private
	 */
	skills_and_traits(all_items, default_group, display_if_empty = null) {
		const raw_groups = this.group_items(all_items, i => i.system.group, null, null, default_group);
		const final_groups = []; // { name: String, contents: Skill[] }

		// Add empty groups
		if (display_if_empty)
			for (const c of display_if_empty)
				if (!(c in raw_groups))
					final_groups.push({name: c, contents: []});

		// Add groups
		for (const g of Object.keys(raw_groups))
			final_groups.push({name: g, contents: raw_groups[g]});

		// Sort groups by name
		final_groups.sort((a, b) => {
			if (a.name === b.name) return 0;
			if (a.name === default_group) return -1;
			if (b.name === default_group) return 1;
			if (a.name < b.name) return -1;
			if (a.name > b.name) return 1;
			return 0;
		});

		return final_groups;
	}

	/**
	 * Organize inventory by item group and by container
	 *
	 * @param {Context} context - Context produced in getData()
	 * @param {string[]} [top_groups] - Item groups to display at the top, regardless of alphabetical order
	 * @param {string} [blank] - Default group for new items or those without a specified group
	 * @return {{name: string, container: null|string, contents: SagaMachineItem[], encumbrance: number, max:number}[]}
	 */
	groups_and_containers({context, top_groups = ['Weapons', 'Armors'], blank = 'Miscellanea'}) {
		const raw_groups = this.group_items(context.data.system.equipment,
			i => i.system.parent || i.system.group, i => !i.system.container);
		if (!context.data.system.equipment.filter(i => !i.system.parent && !i.system.container).length)
			raw_groups[blank] = []; // Add blank group if no non-container groups

		const equipment_groups = []; // { name: String, container: null|Item, contents: Item[], encumbrance: Int, max: 0|Int }

		// Add empty containers
		for (const c of context.data.system.containers)
			if (!(c.id in raw_groups))
				equipment_groups.push({
					name: c.system.full_name,
					container: c,
					contents: [],
					encumbrance: 0,
					max: c.system.container
				});

		// Add other containers and groups
		for (const g of Object.keys(raw_groups)) {
			const container = context.data.system.containers.find(c => c.id === g)
			equipment_groups.push({
				name: container ? container.system.full_name : g,
				container: container || null,
				contents: raw_groups[g],
				encumbrance: raw_groups[g].reduce((total, i) => total + i.system.container_encumbrance, 0),
				max: container ? container.system.container : 0
			});
		}

		// Sort groups by name and whether it is a container
		equipment_groups.sort((a, b) => {
			if (a.name === b.name) return 0;
			for (let g of top_groups) {
				if (a.name === g) return -1;
				if (b.name === g) return 1;
			}

			if (!!a.container && !b.container) return 1;
			if (!!b.container && !a.container) return -1;

			if (a.name < b.name) return -1;
			if (a.name > b.name) return 1;
			return 0;
		});

		return equipment_groups;
	}

	/**
	 * Iterate over list of items and group them into a map by the specified property, optionally apply a filter
	 *
	 * @param {SagaMachineItem[]} items - LItems to group
	 * @param {string|Function} group_path - Function or string representing the group
	 * @param {Function} [filter] - Optional filtering function
	 * @param {Function} [sort] - Optional sorting function
	 * @param {string} [blank_name] - Default group for items without one
	 * @returns {Object.<string, SagaMachineItem[]>}
	 */
	group_items(items, group_path, filter, sort, blank_name) {
		if (!filter) filter = () => true;
		if (!sort) sort = (a, b) => a.name > b.name ? 1 : -1;
		if (!blank_name) blank_name = 'Miscellanea';
		const access = (object, path) => path.split('.').reduce((o, i) => o[i], object);
		const groups = {};

		for (let i of items) {
			if (!filter(i)) continue;
			let group_name = typeof group_path === 'function' ? group_path(i) : access(i, group_path);
			if (!group_name || typeof group_name !== 'string') group_name = blank_name;
			if (group_name in groups) groups[group_name].push(i);
			else groups[group_name] = [i];
		}

		// Sort all groups
		for (const k of Object.keys(groups)) groups[k].sort(sort)

		return groups;
	}

	/**
	 * Calculate health progress bar percentages
	 *
	 * @param {Context} context
	 */
	calc_health_progress_bar(context) {
		if (!context.data.system.scores.health.max) context.data.system.scores.health.percent = 0;
		else context.data.system.scores.health.percent =
			Math.round((context.data.system.scores.health.value / context.data.system.scores.health.max) * 100);
	}

	/****************************************
	 * METHODS THAT SET SHEET INTERACTIVITY *
	 ****************************************/

	/**
	 * @inheritdoc
	 * @override
	 * @param {JQuery} html
	 * */
	activateListeners(html) {
		super.activateListeners(html);

		// Everything below here is only needed if the sheet is editable
		if (!this.isEditable) return;

		html.find('.item-create').on("click", this.on_item_create.bind(this));		// Item creation
		html.find('.item-edit').on("click", this.on_item_edit.bind(this));			// Item editing
		html.find('.item-delete').on("click", this.on_item_delete.bind(this));		// Item deletion
		html.find('.item-remove').on("click", this.on_item_remove.bind(this));		// Remove item from container
		html.find('.item-input').on("change", this.on_item_update.bind(this));		// Update item's rank or quantity

		html.find('.expandable').on("click", this.expand_description.bind(this));	// Expand description
		html.find('.chatable').on("click", this.chat_description.bind(this));		// Send description to chat

		this.attach_drag_events(html);				// Make icons draggable to hot bar, disable drag for input elements
		this.attach_drop_events(html);				// Enable drop events for containers and groups
	}

	/**
	 * Attach data to drag events
	 *
	 * @param {Event} event
	 * @override
	 * @private
	 */
	_onDragStart(event) {
		if (event.currentTarget.dataset['type'] === 'Test') event.stopPropagation();

		// Attach IDs to the dataset
		this.attach_ids(event.currentTarget.dataset);
		const mod_keys = {
			'key-alt': event.altKey,
			'key-ctrl': event.ctrlKey,
			'key-shift': event.shiftKey,
			'key-meta': event.metaKey
		};
		event.dataTransfer.setData("text/plain", JSON.stringify({...event.currentTarget.dataset, ...mod_keys}));

		super._onDragStart(event);
	}

	/**
	 * Create a new item of the specified type
	 *
	 * @param {Event} event
	 * @returns {Promise<SagaMachineItem>}
	 */
	async on_item_create(event) {
		event.preventDefault();

		const type = $(event.currentTarget).data("type");			// Get item type
		const name = $(event.currentTarget).data("name");			// Get item name
		const system = $(event.currentTarget).data("system") || {};	// Get system data

		// Prepare item data
		const itemData = {									// Prepare the item object
			name: name ? name : `New ${type}`,
			type: type,
			system: system
		};

		// Finally, create the item!
		return await Item.create(itemData, {parent: this.actor});
	}

	/**
	 * Open the item sheet for an actor's item
	 *
	 * @param {Event} event
	 * @return {Promise<void>}
	 */
	async on_item_edit(event) {
		const box = $(event.currentTarget).parents(".item");
		const item = this.actor.items.get(box.data("id"));
		item.sheet.render(true);
	}

	/**
	 * Delete an item from the actor
	 *
	 * @param {Event} event
	 * @return {Promise<void>}
	 */
	async on_item_delete(event) {
		const box = $(event.currentTarget).parents(".item");
		const item = this.actor.items.get(box.data("id"));
		if (!!item.system.container) {
			const contained = this.actor.items.filter(i => i.type === 'item' && i.system.parent === item.id);
			await this.actor.updateEmbeddedDocuments("Item", contained.map(i => new Object({
				'_id': i.id,
				'system.parent': null
			})));
		}
		item.delete();
		box.slideUp(200, () => this.render(false));
	}

	/**
	 * Remove an item from a container
	 *
	 * @param {Event} event
	 * @return {Promise<void>}
	 */
	async on_item_remove(event) {
		const box = $(event.currentTarget).parents(".item");
		const item = this.actor.items.get(box.data("id"));
		const update = {_id: item.id, 'system.parent': null};
		this.actor.updateEmbeddedDocuments("Item", [update]);
	}

	async on_item_update(event) {
		const box = $(event.currentTarget).parents(".item");
		const attribute = event.currentTarget.getAttribute('data-name');
		const update = {_id: box.data("id")};
		update[attribute] = Number(event.currentTarget.value);
		this.actor.updateEmbeddedDocuments("Item", [update]);
	}

	/**
	 * Expand the description when the name is clicked
	 *
	 * @param {Event} event
	 * @return {Promise<void>}
	 */
	async expand_description(event) {
		let all_descriptions = null;
		let description = $(event.target).closest('.item').find('.item-description');	// PC sheets
		if (!description.length) {														// NPC sheets
			const id = $(event.target).closest('.item').data('id');
			all_descriptions = $(event.target).closest('.items-inline').find(`.item-description`);
			description = $(event.target).closest('.items-inline').find(`.item-description[data-id='${id}']`);
		}
		if (all_descriptions)
			for (let d of all_descriptions)
				if (d !== description[0] && $(d).is(':visible')) $(d).slideUp(200);
		description.slideToggle(200);
	}

	/**
	 * Send the description to chat when the icon is clicked
	 *
	 * @param {Event} event
	 * @return {Promise<void>}
	 */
	async chat_description(event) {
		const item_id = $(event.target).closest('.item').data('id');
		if (!item_id) return;
		const item = this.actor.items.get(item_id);
		if (!item) return;
		this.to_chat(item);
	}

	/**
	 * Attach macro drag event for hot bar, disable drag for input elements
	 *
	 * @param {JQuery} html
	 */
	attach_drag_events(html) {
		// Drag events for macros
		html.find('.rollable').each((i, li) => {					// Find all items on the character sheet.
			li.setAttribute("draggable", true);		// Add draggable and dragstart listener
			li.addEventListener("dragstart", ev => this._onDragStart(ev), false);
		});

		// Disable drag events for inputs
		html.find('.items-list .item input, .items-list .item select').on('mousedown', function (e) {
			e.stopPropagation();
			$(e.target).closest('.item').attr('draggable', false);
		});
		html.find('.items-list .item').on('mousedown', function (e) {
			$(e.target).attr('draggable', true);
		}).on({
			'dragstart': function (e) {
				e.stopPropagation();
				let dt = e.originalEvent.dataTransfer;
				if (dt) {
					dt.effectAllowed = 'move';
					dt.setData('text/html', '');
				}
			}
		});
	}

	/**
	 * Attach drop events for containers and groups
	 *
	 * @param {JQuery} html
	 */
	attach_drop_events(html) {
		// Handle drop events for containers and item groups
		html.find('.item-group').on('drop', async event => {
			// Get the drag event data
			let data = null;
			try {
				data = JSON.parse(event.originalEvent.dataTransfer.getData("text"));
			} catch (error) {
			}
			if (!data || !data.uuid || data.type !== 'Item') return;

			// Get the item being dropped
			const drop_item = await fromUuid(data.uuid);
			if (drop_item.type !== 'item') return;

			// Get the container ID, if applicable, and add the item to the container if it fits
			const container_id = $(event.currentTarget).data('id');
			if (container_id)
				if (drop_item.system.container_encumbrance + $(event.currentTarget).data('encumbrance') <= $(event.currentTarget).data('max'))
					await drop_item.update({'system.parent': container_id});

				// Otherwise, remove the item from the container
				else await drop_item.update({'system.parent': null});
		});
	}

	/**
	 * Handle right-click on scores: toggle on/off custom mode or decrement secondary score
	 *
	 * @param {Event} event
	 * @return {Promise<void>}
	 */
	async on_score_toggle(event) {
		event.preventDefault();
		const target = $(event.target);
		if (target.hasClass('score-secondary')) this.adjust_score(target, -1);
		else this.toggle_custom(target);
	}

	/**
	 * Handle clicks on secondary scores to increment them
	 *
	 * @param {Event} event
	 * @return {Promise<void>}
	 */
	async on_score_increment(event) {
		event.preventDefault();
		const target = $(event.target);
		if (target.hasClass('score-secondary')) this.adjust_score(target, 1);
	}

	/**
	 * Attach token, scene and/or actor IDs to the given dataset
	 *
	 * @param {{}} dataset
	 */
	attach_ids(dataset) {
		// Attach token and scene ID, if available
		if (this.token) {
			dataset['tokenId'] = this.token.id;
			dataset['sceneId'] = this.token.parent.id;
		}

		// Otherwise, attach the actor ID
		else {
			dataset['actorId'] = this.actor.id;
		}
	}

	/**
	 * Adjust the actor's score by the given value. Usually used to increment or decrement.
	 *
	 * @param {JQuery} target
	 * @param {number} mod
	 */
	adjust_score(target, mod) {
		const score_name = target.attr('name');
		const score = this.get_score(score_name, []);

		// Make the adjustment
		const update_obj = {};
		update_obj[score_name] = score + mod;
		this.actor.update(update_obj);
	}

	/**
	 * Toggle between custom mode and calculated mode for actor's score.
	 *
	 * @param {HTMLElement} element
	 */
	toggle_custom(element) {
		const input = element.hasClass('score-input') ? element : element.find('.score-input');
		if (!input.length) return;

		const score_name = input.attr('name');
		const score = this.get_score(score_name, ['max', 'value', 'tn']);
		if (!score) return; // If the score was not found, do nothing

		// Toggle custom value
		input.prop('disabled', !!score.custom);
		const score_custom = this.get_score_custom(score_name);
		const update_obj = {};
		update_obj[score_custom] = !score.custom;
		this.actor.update(update_obj);
	}

	/**
	 * Get the score object for the actor
	 *
	 * @param {string} score_name
	 * @param {string[]} ignore_array
	 * @return {string|Actor}
	 */
	get_score(score_name, ignore_array) {
		const path = score_name.split('.');
		let pointer = this.actor;
		for (const p of path) {
			if (pointer && !ignore_array.includes(p)) pointer = pointer[p] ? pointer[p] : null;
			else return pointer;
		}
		return pointer;
	}

	/**
	 * Get whether this particular score has custom mode set
	 *
	 * @param {string} score_name
	 * @return {string}
	 * @private
	 */
	get_score_custom(score_name) {
		return score_name.substring(0, score_name.lastIndexOf("\.")) + '.custom';
	}

	/**
	 * Send chatable item to group chat
	 *
	 * @param {SagaMachineItem} item
	 */
	to_chat(item) {
		ChatMessage.create({
			flavor: `<header class="item-header"><img src="${item.img}" alt="${item.name}" /><h2>${item.name}</h2></header>`,
			content: item.system.description,
			speaker: ChatMessage.getSpeaker({actor: this.actor})
		});
	}

	/**
	 * When a roll label is clicked, open the test dialog
	 *
	 * @param event
	 * @returns {Promise<void>}
	 */
	async on_test(event) {
		event.preventDefault();
		this.attach_ids(event.currentTarget.dataset);		// Attach IDs to the dataset
		await test_dialog(event.currentTarget.dataset);		// Show the dialog
	}
}

/**
 * Character sheet functionality for PCs and NPCs
 */
export class CharacterSheet extends SagaMachineActorSheet {
	/**
	 * Dynamically set the HTML template for the actor based on permissions and PC/NPC
	 *
	 * @returns {string}
	 * @override
	 */
	get template() {
		if (!game.user.isGM && this.actor.limited) return "systems/saga-machine/templates/actors/limited-sheet.html";
		if (this.actor.is_pc()) return `systems/saga-machine/templates/actors/pc-sheet.html`;
		else return `systems/saga-machine/templates/actors/npc-sheet.html`;
	}

	/**
	 * @inheritdoc
	 * @override
	 * */
	getData() {
		const context = super.getData();

		// Add constant for Lifestyles dropdown
		context.data.system.LIFESTYLES = LIFESTYLES;

		// Organize inventory
		context.data.system.equipment_groups = this.groups_and_containers({
			context: context,
			top_groups: ['Weapons', 'Armors'],
			blank: 'Miscellanea'
		});

		context.data.system.actions = this.gather_actions(context);	// Gather the list of actions
		this.calc_health_progress_bar(context);						// Calculate health progress bar percentages

		return context;
	}

	/**
	 * @inheritDoc
	 * @override
	 */
	activateListeners(html) {
		super.activateListeners(html);

		html.find('.rollable').click(this.on_test.bind(this));						// Open test dialog
		html.find('.score').on("contextmenu", this.on_score_toggle.bind(this));		// Toggle custom score mode on/off
		html.find('.score').on("click", this.on_score_increment.bind(this));		// Increment secondary score
		html.find('.item-equip').click(this.on_item_equip.bind(this));				// Item equipping
		html.find('.item-carry').click(this.on_item_carry.bind(this));				// Item carrying
		html.find('.items-inline > .item').on("contextmenu", this.on_npc_edit.bind(this));	// Open item on NPC sheet

		html.find('.action-edit').on("click", this.on_action_edit.bind(this));			// Action editing
		html.find('.action-delete').on("click", this.on_action_delete.bind(this));		// Action deletion
	}

	async on_action_edit(event) {
		const box = $(event.currentTarget).parents(".item");
		if (box.data('direct')) await this.on_item_edit(event);
		else {
			const parent = this.actor.items.get(box.data("parentId"));
			const index = ActionHelper.parent_action_index(parent, box.data('id'));
			if (index > parent.system.actions.length || index < 0) return;
			const action = new SagaMachineItem(parent.system.actions[index], { parent: parent });
			action.sheet.render(true);
		}
	}

	async on_action_delete(event) {
		const box = $(event.currentTarget).parents(".item");
		if (box.data('direct')) await this.on_item_delete(event);
		else {
			const parent = this.actor.items.get(box.data("parentId"));
			const index = ActionHelper.parent_action_index(parent, box.data('id'));
			parent.system.actions.splice(index, 1);
			parent.update({ 'system.actions': parent.system.actions });
			box.remove();
		}
	}

	/**
	 * Equip or un-equip an item
	 *
	 * @param {Event} event
	 * @return {Promise<void>}
	 */
	async on_item_equip(event) {
		const box = $(event.currentTarget).parents(".item");
		const item = this.actor.items.get(box.data("id"));
		const update = {_id: item.id, 'system.equipped': !item.system.equipped};
		this.actor.updateEmbeddedDocuments("Item", [update]);
	}

	/**
	 * Carry or un-carry an item
	 *
	 * @param {Event} event
	 * @return {Promise<void>}
	 */
	async on_item_carry(event) {
		const box = $(event.currentTarget).parents(".item");
		const item = this.actor.items.get(box.data("id"));
		const update = {_id: item.id, 'system.carried': !item.system.carried};
		this.actor.updateEmbeddedDocuments("Item", [update]);
	}

	/**
	 * Open item dialogs on NPC sheet
	 *
	 * @param event
	 * @return {Promise<void>}
	 */
	async on_npc_edit(event) {
		event.preventDefault();
		const box = $(event.currentTarget).closest(".item");
		const item = this.actor.items.get(box.data("id"));
		item.sheet.render(true);
	}

	/**
	 * Return list of all actions provided by items or owned by the actor directly
	 *
	 * @param {Context} context
	 * @returns {SagaMachineItem[]}

	 */
	gather_actions(context) {
		const actions = this.items(context, 'action');
		const action_items = context.actor.items.filter(item => item.system.actions?.length &&
			(item.system.equipped || item.system.equipped === undefined));

		for (let item of action_items)
			for (let action of item.system.actions)
				actions.push(new SagaMachineItem(action, { parent: item }));

		return actions;
	}
}

/**
 * Character sheet functionality for stashes and shops
 */
export class StashSheet extends SagaMachineActorSheet {
	/**
	 * @inheritdoc
	 * @override
	 * */
	getData() {
		const context = super.getData();

		// Add constant for type dropdown
		context.data.system.STASH_TYPES = STASH_TYPES;

		// Organize inventory
		context.data.system.equipment_groups = this.groups_and_containers({
			context: context,
			top_groups: ['Weapons', 'Armors'],
			blank: 'Miscellanea'
		});

		return context;
	}

	/**
	 * @inheritDoc
	 * @override
	 */
	activateListeners(html) {
		super.activateListeners(html);

		html.find('.distribute-money').on("click", this.distribute_money.bind(this));		// Distribute money
	}

	async distribute_money() {
		const tokens = game?.canvas?.tokens?.controlled;  // Get selected tokens
		if (!tokens.length) return ui.notifications.warn("No valid character selected.");

		let money_remaining = this.actor.system.wealth.money % tokens.length;				// Remaining on sheet
		const money_each = Math.floor(this.actor.system.wealth.money / tokens.length);	// Money for each actor

		// Update selected actors
		for (let token of tokens) {
			if (token.actor.isOwner)
				token.actor.update({'system.wealth.money': token.actor.system.wealth.money + money_each});
			else money_remaining += money_each;
		}

		// Update this actor
		this.actor.update({'system.wealth.money': money_remaining});

		// Report the exchange to chat
		const target_names = '<li>' + tokens.map(t => `@UUID[${t.actor.uuid}]{${t.name}}`).join('</li><li>') + '</li>';
		ChatMessage.create({content: `<strong>${money_each}¤</strong> each distributed from @UUID[${this.actor.uuid}]{${this.actor.name}} to:<ul style="line-height: 1.7em">${target_names}</ul>`});
	}
}

/**
 * Character sheet functionality for vehicles
 */
export class VehicleSheet extends SagaMachineActorSheet {
	/**
	 * @inheritdoc
	 * @override
	 * */
	getData() {
		const context = super.getData();

		// Add constants for availability and handling dropdowns
		context.data.system.VEHICLE_AVAILABILITY = VEHICLE_AVAILABILITY;
		context.data.system.VEHICLE_HANDLING = VEHICLE_HANDLING;

		// Organize inventory
		context.data.system.equipment_groups = this.groups_and_containers({
			context: context,
			top_groups: ['Vehicle Components', 'Trade Goods'],
			blank: 'Trade Goods'
		});

		this.calc_health_progress_bar(context);	// Calculate health progress bar percentages
		this.calc_space_progress_bar(context);	// Calculate space progress bar percentages

		return context;
	}

	/**
	 * @inheritDoc
	 * @override
	 */
	activateListeners(html) {
		super.activateListeners(html);

		html.find('.score').on("contextmenu", this.on_score_toggle.bind(this));		// Toggle custom score mode on/off
		html.find('.score').on("click", this.on_score_increment.bind(this));		// Increment secondary score

		// Handle positions
		this.draw_positions(html);
		html.find('.position-list .position-create').click(this.add_position.bind(this));
		html.find('.position-list .position-delete').click(this.delete_position.bind(this));
	}

	/**
	 * Calculate space progress bar percentages
	 *
	 * @param {Context} context
	 */
	calc_space_progress_bar(context) {
		if (!context.data.system.scores.space.max) context.data.system.scores.space.percent = 0;
		else context.data.system.scores.space.percent =
			Math.round((context.data.system.scores.space.value / context.data.system.scores.space.max) * 100);
	}

	/**
	 * Add a position to the vehicle positions form
	 */
	add_position() {
		if (!this.isEditable) return;

		// Get the prototype position node and parent node, return if it wasn't found
		const prototype = this.element.find('.position.prototype');
		const parent = this.element.find('ol.position-list');
		if (!prototype || !prototype.length || !parent || !parent.length) return;

		const clone = prototype.clone();
		clone.removeClass('prototype');
		clone.find('input, select').change(this.update_positions.bind(this));
		parent.append(clone);
	}

	/**
	 * Delete a position in the vehicle position form
	 *
	 * @param {Event} event
	 */
	delete_position(event) {
		const box = $(event.currentTarget).closest(".position");
		const position_list = box.closest('.position-list');
		box.remove();
		this.update_positions(event, position_list);
	}

	/**
	 * Draw the vehicle positions form
	 *
	 * @param {JQuery} html
	 */
	draw_positions(html) {
		// Don't draw positions if there are no positions
		if (!this.actor.system.scores.crew.positions || !this.actor.system.scores.crew.positions.length) return;

		// Get the prototype attack position and parent node, return if it wasn't found
		const prototype = html.find('.position.prototype');
		const parent = html.find('ol.position-list');
		if (!prototype || !prototype.length || !parent || !parent.length) return;

		// For each position, clone the prototype and set up the form
		for (let position of this.actor.system.scores.crew.positions) {
			const clone = prototype.clone();
			clone.removeClass('prototype');
			clone.find("[name=position]").val(position.position);
			clone.find("[name=character]").val(position.character);
			parent.append(clone);

			// Set up the data handlers for the form, if this sheet is editable
			if (!this.isEditable) continue;
			clone.find('input, select').change(this.update_positions.bind(this));
		}
	}

	/**
	 * Handle changes to the vehicle position form
	 *
	 * @param {Event} event
	 * @param {JQuery|null} position_list
	 */
	update_positions(event, position_list = null) {
		event.preventDefault();
		event.stopPropagation();

		// Get all positions
		const position_nodes = position_list ? position_list.find('.position:not(.prototype)') :
			$(event.currentTarget).closest('ol.position-list').find('.position:not(.prototype)');

		// Iterate over each node and add to the list
		const positions = [];
		position_nodes.each((i, node) => {
			let position = $(node).find("[name=position]").val().trim();
			let character = $(node).find("[name=character]").val().trim();

			// Create position, add name and properties if set, add to list
			const position_object = {
				position: position,
				character: character
			};
			positions.push(position_object);

			this.actor.update({'system.scores.crew.positions': positions});
		});
	}
}