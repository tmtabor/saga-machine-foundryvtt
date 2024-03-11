import { Attack, test_dialog } from "./tests.js";

Hooks.once("init", async () => {
	// Register handlebars helpers
	Handlebars.registerHelper("is_GM", () => game.user.isGM);
	Handlebars.registerHelper("is_weapon", item => item.system.group.toLowerCase() === 'weapons');
	Handlebars.registerHelper("is_wearable", item => item.system.group.toLowerCase() === 'armors' ||
		item.system.group.toLowerCase() === 'apparel');

	// Register handlebars partials
	loadTemplates([
		'systems/saga-machine/templates/partials/character-header.html',
		'systems/saga-machine/templates/partials/character-sidebar.html',
		'systems/saga-machine/templates/partials/character-inventory.html'
	]);
});

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class SagaMachineActorSheet extends ActorSheet {

	/** @inheritdoc */
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["saga-machine", "sheet", "actor"],
			template: "systems/saga-machine/templates/actor-sheet.html",
			width: 850,
			height: 650,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "basics"}],
			scrollY: [".basics", ".combat", ".inventory", ".advancement"],
			dragDrop: [{dragSelector: ".items-list .item", dropSelector: null}]
		});
	}

    /**
     * Dynamically set the HTML template for the actor type
     * @returns {string}
     */
    get template() {
		if (!game.user.isGM && this.actor.limited) return "systems/saga-machine/templates/actors/limited-sheet.html";
		if (this.actor.is_pc()) 	return `systems/saga-machine/templates/actors/pc-sheet.html`;
		if (this.actor.is_npc()) 	return `systems/saga-machine/templates/actors/npc-sheet.html`;
									return `systems/saga-machine/templates/actors/${this.actor.type}-sheet.html`;
    }

	/** @inheritdoc */
	getData() {
		const context = super.getData();

		// Filter and sort all item lists for the character
		context.data.system.ambitions = this.items(context, 'ambition', null,
			(a, b) =>  a.system.type > b.system.type ? 1 : -1);
		context.data.system.paths = this.items(context, 'path');
		context.data.system.origins = this.items(context, 'origin');
		context.data.system.all_skills = this.items(context, 'skill');
		context.data.system.skill_groups = this._skills_and_traits(context.data.system.all_skills, 'General Skills');
		context.data.system.all_traits = this.items(context, 'trait');
		context.data.system.trait_groups = this._skills_and_traits(context.data.system.all_traits, 'General Traits', ['General Traits', 'Weaknesses']);
		context.data.system.consequences = this.items(context, 'consequence');
		context.data.system.equipment = this.items(context, 'item');
		context.data.system.containers = this.items(context, 'item', i => !!i.system.container);
		context.data.system.equipment_groups = this._groups_and_containers(context)

		if (this.actor.type === 'character') {
			// Gather the list of attacks
			context.data.system.attacks = this._gather_attacks(context);

			// Calculate progress bar percentages
			if (!context.data.system.scores.health.max) context.data.system.scores.health.percent = 0;
			else context.data.system.scores.health.percent =
				Math.round((context.data.system.scores.health.value / context.data.system.scores.health.max) * 100);
		}

		return context;
	}

	/** @inheritdoc */
	activateListeners(html) {
		super.activateListeners(html);

		// Everything below here is only needed if the sheet is editable
		if ( !this.isEditable ) return;

		// Item creation
		html.find('.item-create').click(this._on_item_create.bind(this));

		// Item equipping / unequipping
		html.find('.item-equip').click(ev => {
			const box = $(ev.currentTarget).parents(".item");
			const item = this.actor.items.get(box.data("id"));
			const update = { _id: item.id, 'system.equipped': !item.system.equipped };
			this.actor.updateEmbeddedDocuments("Item", [update] );
		});

		// Item remove from container
		html.find('.item-remove').click(ev => {
			const box = $(ev.currentTarget).parents(".item");
			const item = this.actor.items.get(box.data("id"));
			const update = { _id: item.id, 'system.parent': null };
			this.actor.updateEmbeddedDocuments("Item", [update] );
		});

		// Item carrying / uncarrying
		html.find('.item-carry').click(ev => {
			const box = $(ev.currentTarget).parents(".item");
			const item = this.actor.items.get(box.data("id"));
			const update = { _id: item.id, 'system.carried': !item.system.carried };
			this.actor.updateEmbeddedDocuments("Item", [update] );
		});

		// Item editing
		html.find('.item-edit').click(ev => {
			const box = $(ev.currentTarget).parents(".item");
			const item = this.actor.items.get(box.data("id"));
			item.sheet.render(true);
		});

		// Item deletion
		html.find('.item-delete').click(async ev => {
			const box = $(ev.currentTarget).parents(".item");
			const item = this.actor.items.get(box.data("id"));
			if (!!item.system.container) {
				const contained = this.actor.items.filter(i => i.type === 'item' && i.system.parent === item.id);
				await this.actor.updateEmbeddedDocuments("Item", contained.map(i => new Object({ '_id': i.id, 'system.parent': null })));
			}
			item.delete();
			box.slideUp(200, () => this.render(false));
		});

		// Dynamic updating of item rank and quantity
		html.find('.item-input').on("change", ev => {
			const box = $(ev.currentTarget).parents(".item");
			const attribute = ev.currentTarget.getAttribute('data-name');
			const update = { _id: box.data("id") };
			update[attribute] = Number(ev.currentTarget.value);
			this.actor.updateEmbeddedDocuments("Item", [update] );
		});

		// Handle custom score toggle, decrement and increment
		html.find('.score').on('contextmenu', event => {
			event.preventDefault();
			const target = $(event.target);
			if (target.hasClass('score-secondary')) this._adjust_score(target, -1);
			else this._toggle_custom(target);
		}).on('click', event => {
			event.preventDefault();
			const target = $(event.target);
			if (target.hasClass('score-secondary')) this._adjust_score(target, 1);
		});

		// Allow rollable labels to open roll dialog
		html.find('.rollable').click(this.on_test.bind(this));

		// Allow expandable elements to toggle their description
		html.find('.expandable').click(event => {
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
		});

		// Allow chatable items to be sent to group chat
		html.find('.chatable').click(event => {
			const item_id = $(event.target).closest('.item').data('id');
			if (!item_id) return;
			const item = this.actor.items.get(item_id);
			if (!item) return;
			this.to_chat(item);
		});

		// Drag events for macros.
		html.find('.rollable').each((i, li) => {					// Find all items on the character sheet.
			li.setAttribute("draggable", true);	// Add draggable and dragstart listener
			li.addEventListener("dragstart", ev => this._onDragStart(ev), false);
		});

		// Disable drag events for inputs
		html.find('.items-list .item input, .items-list .item select').on('mousedown', function(e) {
			e.stopPropagation();
			$(e.target).closest('.item').attr('draggable', false);
		});
		html.find('.items-list .item').on('mousedown', function(e) {
			$(e.target).attr('draggable', true);
		}).on({
			'dragstart': function(e) {
				e.stopPropagation();
				let dt = e.originalEvent.dataTransfer;
				if (dt) {
					dt.effectAllowed = 'move';
					dt.setData('text/html', '');
				}
			}
		});

		// Handle drop events for containers and item groups
		html.find('.item-group').on('drop', async event => {
			// Get the drag event data
			let data = null;
			try { data = JSON.parse(event.originalEvent.dataTransfer.getData("text")); } catch(error) {}
			if (!data || !data.uuid || data.type !== 'Item') return;

			// Get the item being dropped
			const drop_item = await fromUuid(data.uuid);
			if (drop_item.type !== 'item') return;

			// Get the container ID, if applicable, and add the item to the container if it fits
			const container_id = $(event.currentTarget).data('id');
			if (container_id)
				if (drop_item.system.container_encumbrance + $(event.currentTarget).data('encumbrance') <= $(event.currentTarget).data('max'))
					await drop_item.update({ 'system.parent': container_id });

			// Otherwise, remove the item from the container
			else await drop_item.update({ 'system.parent': null });
		});

		// Open item dialogs on NPC sheet
		html.find('.items-inline > .item').on('contextmenu', event => {
			event.preventDefault();
			const box = $(event.currentTarget).closest(".item");
			const item = this.actor.items.get(box.data("id"));
			item.sheet.render(true);
		})

		// Distribute money
		html.find('.distribute-money').on("click", event=> {
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
		});
	}

	to_chat(item) {
		ChatMessage.create({
			flavor: `<header class="item-header"><img src="${item.img}" /><h2>${item.name}</h2></header>`,
			content: item.system.description,
			speaker: ChatMessage.getSpeaker({ actor: this.actor })
		});
	}

	_skills_and_traits(all_items, default_group, display_if_empty=null) {
		const raw_groups = this.group_items(all_items, i => i.system.group, null, null, default_group);
		const final_groups = []; // { name: String, contents: Skill[] }

		// Add empty groups
		if (display_if_empty)
			for (const c of display_if_empty)
				if (!(c in raw_groups))
					final_groups.push({ name: c, contents: [] });

		// Add groups
		for (const g of Object.keys(raw_groups))
			final_groups.push({ name: g, contents: raw_groups[g] });

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

	_groups_and_containers(context) {
		const raw_groups = this.group_items(context.data.system.equipment,
				i => i.system.parent || i.system.group, i => !i.system.container);
		if (!context.data.system.equipment.filter(i => !i.system.parent && !i.system.container).length)
			raw_groups['Miscellanea'] = []; // Add blank group if no non-container groups

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

		// Sort groups by name and whether or not it is a container
		equipment_groups.sort((a, b) => {
			if (a.name === b.name) return 0;
			if (a.name === 'Weapons') return -1;
			if (b.name === 'Weapons') return 1;
			if (a.name === 'Armors') return -1;
			if (b.name === 'Armors') return 1;

			if (!!a.container && !b.container) return 1;
			if (!!b.container && !a.container) return -1;

			if (a.name < b.name) return -1;
			if (a.name > b.name) return 1;
			return 0;
		});

		return equipment_groups;
	}

	/**
	 * Return list of all attacks provided by all items
	 *
	 * @param context
	 * @returns {*[]}
	 * @private
	 */
	_gather_attacks(context) {
		const attacks = [];
		const attack_items = context.actor.items.filter(item => item.system.attacks && item.system.attacks.length &&
			(item.system.equipped || item.system.equipped === undefined));

		for (let item of attack_items)
			for (let attack of item.system.attacks)
				attacks.push(new Attack({
					actor: this.actor,
					item: item,
					name: item.system.full_name,
					type: item.type,
					properties: item.system.properties || '',
					...attack
				}));

		return attacks;
	}

	/**
	 * Attach data to hotbar drag events
	 *
	 * @param event
	 * @private
	 */
	_onDragStart(event) {
		if (event.currentTarget.dataset['type'] === 'Test') event.stopPropagation();

		// Attach IDs to the dataset
		this._attach_ids(event.currentTarget.dataset);
		event.dataTransfer.setData("text/plain", JSON.stringify(event.currentTarget.dataset));

		super._onDragStart(event);
	}

	/**
	 * Iterate over list of items and group them into a map by the specified property, optionally apply a filter
	 *
	 * @param items
	 * @param group_path
	 * @param filter
	 * @param sort
	 * @param blank_name
	 * @returns {{}}
	 */
	group_items(items, group_path, filter, sort, blank_name) {
		if (!filter) filter = a => true;
		if (!sort) sort = (a, b) =>  a.name > b.name ? 1 : -1;
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
	 * Get all items of the specified type, apply an optional secondary filter and sort (alphabetically by default)
	 *
	 * @param data
	 * @param type
	 * @param filter
	 * @param sort
	 * @returns {*}
	 */
	items(data, type, filter, sort) {
		if (!filter) filter = a => true;
		if (!sort) sort = (a, b) =>  a.name > b.name ? 1 : -1;
		return data.actor.items.filter( item => item.type === type && filter(item)).sort(sort);
	}

	_adjust_score(target, mod) {
		const score_name = target.attr('name');
		const score = this._get_score(score_name, []);

		// Make the adjustment
		const update_obj = {};
		update_obj[score_name] = score + mod;
		this.actor.update(update_obj);
	}

	_toggle_custom(element) {
		const input = element.hasClass('score-input') ? element : element.find('.score-input');
		if (!input.length) return;

		const score_name = input.attr('name');
		const score = this._get_score(score_name, ['max', 'value']);
		if (!score) return; // If the score was not found, do nothing

		// Toggle custom value
		input.prop('disabled', !!score.custom);
		const score_custom = this._get_score_custom(score_name);
		const update_obj = {};
		update_obj[score_custom] = !score.custom;
		this.actor.update(update_obj);
	}

	_get_score_custom(score_name) {
		return score_name.substr(0, score_name.lastIndexOf("\.")) + '.custom';
	}

	_get_score(score_name, ignore_array) {
		const path = score_name.split('.');
		let pointer = this.actor;
		for (const p of path) {
			if (pointer && !ignore_array.includes(p)) pointer = pointer[p] ? pointer[p] : null;
			else return pointer;
		}
		return pointer;
	}

	/**
	 * When a roll label is clicked, open the test dialog
	 *
	 * @param event
	 * @returns {Promise<void>}
	 * @private
	 */
	async on_test(event) {
		event.preventDefault();
		this._attach_ids(event.currentTarget.dataset);		// Attach IDs to the dataset
		await test_dialog(event.currentTarget.dataset);		// Show the dialog
	}

	/**
	 * Attach token, scene and/or actor IDs to the given dataset
	 *
	 * @param dataset
	 */
	_attach_ids(dataset) {
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
	 * Create a new item of the specified type
	 *
	 * @param event
	 * @returns {Promise<*>}
	 * @private
	 */
	async _on_item_create(event) {
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
}
