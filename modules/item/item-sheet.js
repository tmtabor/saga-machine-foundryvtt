/**
 * The following constants were moved from the templates to code due to deprecations in Foundry 12
 */

/**
 * Used to build the type dropdown on the Ambitions sheet
 */
export const AMBITION_TYPES = {
    'Long-term': 'Long-term',
    'Short-term': 'Short-term',
    'Party': 'Party',
    'Quest': 'Quest'
};

/**
 * Used to build the default stat dropdown on the Skill sheet
 */
export const SKILL_DEFAULTS = {
    '': '--',
    'strength': 'Strength',
    'dexterity': 'Dexterity',
    'speed': 'Speed',
    'endurance': 'Endurance',
    'intelligence': 'Intelligence',
    'perception': 'Perception',
    'charisma': 'Charisma',
    'determination': 'Determination'
};

/**
 * Used to build the availability dropdown on the Item sheet
 */
export const ITEM_AVAILABILITY = {
    'common': 'Common',
    'uncommon': 'Uncommon',
    'rare': 'Rare',
    'exotic': 'Exotic'
};

/**
 * Extend the basic ItemSheet with some very simple modifications
 */
export class SagaMachineItemSheet extends ItemSheet {
    /**********************************
     * METHODS THAT SET BASIC OPTIONS *
     **********************************/

    /**
     * The default options for item sheets
     *
     * @override
     * @returns {DocumentSheetOptions}
     * */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["saga-machine", "sheet", "item"],
            width: 600,
            height: 360,
            tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "basics"}],
            scrollY: [".basics", ".attacks", "effects", ".description"]
        });
    }

    /**
     * Dynamically set the HTML template for the item type
     *
     * @returns {string}
     */
    get template() {
        return `systems/saga-machine/templates/items/${this.item.type}-sheet.html`;
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

        // Add constants by type
        if (this.item.type === 'ambition') context.data.system.AMBITION_TYPES = AMBITION_TYPES;
        if (this.item.type === 'skill') context.data.system.SKILL_DEFAULTS = SKILL_DEFAULTS;
        if (this.item.type === 'item') context.data.system.ITEM_AVAILABILITY = ITEM_AVAILABILITY;

        if (this.item.type === 'origin' || this.item.type === 'path') {
            context.data.system.skills_provided = this.items_provided('skill', context.data.system.skills);
            context.data.system.traits_provided = this.items_provided('trait', context.data.system.traits);
            context.data.system.equipment_provided = this.items_provided('item', context.data.system.equipment);
        }

        return context;
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

        // Toggle edit/display of provided fields in origins/paths
        html.find('.items-provided').on("contextmenu", this.toggle_items_provided.bind(this));

        html.find('.effect-create').on('click', this.on_create_effect.bind(this));  // Create active effect
        html.find('.effect-edit').on('click', this.on_edit_effect.bind(this));      // Open active effect sheet
        html.find('.effect-delete').on('click', this.on_delete_effect.bind(this));  // Delete active effect
        html.find('.effect-toggle').on('click', this.on_toggle_effect.bind(this));  // Toggle effect on/off

        // Handle attacks
        this.draw_attacks(html);
        html.find('.attacks .item-create').click(this.add_attack.bind(this));
        html.find('.attacks .item-delete').click(this.delete_attack.bind(this));
    }

    /**
     * Toggle edit/display of provided fields in origins/paths
     *
     * @param {Event} event
     */
    toggle_items_provided(event) {
        event.preventDefault();
        const target = $(event.target);
        target.parent().find('.items-provided').each((i, e) => {
            if ($(e).is(':visible')) e.style.display = 'none';
            else e.style.display = 'block';
        });
    }

    /**************************************
     * METHODS THAT HANDLE ACTIVE EFFECTS *
     **************************************/

    /**
     * Handle creating active effects
     *
     * @param {Event} event
     * @return {Promise<void>}
     */
    async on_create_effect(event) {
        event.preventDefault();
        return await ActiveEffect.create({name: 'New Effect'}, {parent: this.item});
    }

    /**
     * Handle editing active effects
     *
     * @param {Event} event
     * @return {Promise<void>}
     */
    async on_edit_effect(event) {
        const box = $(event.target).closest('.effect');
        const id = box.data("id");
        const name = box.data("name");
        const effect = id ? this.item.effects.get(id) : this.item.effects.getName(name);
        if (effect) effect.sheet.render(true);
    }

    /**
     * Handle deleting active effects
     *
     * @param {Event} event
     * @return {Promise<void>}
     */
    async on_delete_effect(event) {
        const box = $(event.target).closest('.effect');
        const id = box.data("id");
        const name = box.data("name");
        const effect = id ? this.item.effects.get(id) : this.item.effects.getName(name);
        effect.delete();
        box.slideUp(200, () => this.render(false));
    }

    /**
     * Effect activate / disabled
     *
     * @param {Event} event
     * @return {Promise<void>}
     */
    async on_toggle_effect(event) {
        const box = $(event.target).closest('.effect');
        const id = box.data("id");
        const name = box.data("name");
        const effect = id ? this.item.effects.get(id) : this.item.effects.getName(name);
        effect.update({'disabled': !effect.disabled});
    }

    /*******************************
     * METHODS THAT HANDLE ATTACKS *
     *******************************/

    /**
     * Render the list of attacks
     *
     * @param {JQuery} html
     */
    draw_attacks(html) {
        // Don't draw attacks if there are no attacks
        if (!this.item.system.attacks || !this.item.system.attacks.length) return;

        // Get the prototype attack node and parent node, return if it wasn't found
        const prototype = html.find('.attack.prototype');
        const parent = html.find('ol.attack-list');
        if (!prototype || !prototype.length || !parent || !parent.length) return;

        // For each attack, clone the prototype and set up the form
        for (let attack of this.item.system.attacks) {
            const clone = prototype.clone();
            clone.removeClass('prototype');
            clone.find("[name=attack_name]").val(attack.name);
            clone.find("[name=stat]").val(attack.stat);
            clone.find("[name=skill]").val(attack.skill);
            clone.find("[name=damage]").val(this.find_damage(attack));
            clone.find("[name=damage_type]").val(this.find_damage_type(attack));
            clone.find("[name=targets]").val(attack.tn);
            clone.find("[name=properties]").val(attack.properties);
            clone.find("[name=consequences]").val(this.find_consequences(attack));
            parent.append(clone);

            // Set up the data handlers for the form, if this sheet is editable
            if (!this.isEditable) continue;
            clone.find('input, select').change(this.update_attacks.bind(this));
        }
    }

    /**
     * Add a new attack to the list
     */
    add_attack() {
        if (!this.isEditable) return;

        // Get the prototype attack node and parent node, return if it wasn't found
        const prototype = this.element.find('.attack.prototype');
        const parent = this.element.find('ol.attack-list');
        if (!prototype || !prototype.length || !parent || !parent.length) return;

        const clone = prototype.clone();
        clone.removeClass('prototype');
        clone.find('input, select').change(this.update_attacks.bind(this));
        parent.append(clone);
    }

    /**
     * Delete an attack from the list
     *
     * @param {Event} event
     */
    delete_attack(event) {
        const box = $(event.currentTarget).closest(".attack");
        const attack_list = box.closest('.attack-list');
        box.remove();
        this.update_attacks(event, attack_list);
    }

    /**
     * Handle changes to the attack form
     *
     * @param {Event} event
     * @param {JQuery} attack_list
     */
    update_attacks(event, attack_list = null) {
        event.preventDefault();
        event.stopPropagation();

        // Get all attacks
        const attack_nodes = attack_list ? attack_list.find('.attack:not(.prototype)') :
            $(event.currentTarget).closest('ol.attack-list').find('.attack:not(.prototype)');

        // Iterate over each node and add to the list
        const attacks = [];
        attack_nodes.each((i, node) => {
            let name = $(node).find("[name=attack_name]").val().trim();
            let stat = $(node).find("[name=stat]").val().trim();
            let skill = $(node).find("[name=skill]").val().trim();
            let properties = $(node).find("[name=properties]").val().trim();
            let damage = $(node).find("[name=damage]").val().trim();
            let damage_type = $(node).find("[name=damage_type]").val().trim();
            let targets = $(node).find("[name=targets]").val().trim();
            let consequences = $(node).find("[name=consequences]").val().trim();

            if (!stat) return; // Don't add if no stat is specified

            // Create attack, add name and properties if set, add to list
            const attack = {
                stat: stat,
                skill: skill,
                tn: targets,
                effects: this.create_effects(damage, damage_type, consequences)
            };
            if (name) attack['name'] = name;
            if (properties) attack['properties'] = properties;
            attacks.push(attack);

            this.item.update({'system.attacks': attacks});
        });
    }

    /**
     * Get the attack's damage
     *
     * @param {Attack} attack
     * @return {string}
     */
    find_damage(attack) {
        return this.search_effects(attack, 'damage', 'value');
    }

    /**
     * Get the attack's damage type
     * @param {Attack} attack
     * @return {string}
     */
    find_damage_type(attack) {
        return this.search_effects(attack, 'damage', 'damage_type');
    }

    /**
     * Get any consequences imposed with a successful attack
     *
     * @param {Attack} attack
     * @return {string}
     */
    find_consequences(attack) {
        return this.search_effects(attack, 'consequence', 'name', true);
    }

    /**
     * Search those all effects imposed by the attack and return those matching the specified type
     *
     * @param {Attack} attack - The Attack object to search
     * @param {string} type - The type of the Effect object
     * @param {string} property - The property of the object containing the desired value
     * @param {boolean} find_all - Whether to return all instances of the matching type or only the first
     * @return {string}
     */
    search_effects(attack, type, property, find_all = false) {
        // Ensure that effects are in the right format
        if (!attack.effects || !attack.effects.length) return '';
        let parsed_effects = typeof attack.effects === 'string' ?
            JSON.parse(attack.effects) : attack.effects;
        parsed_effects = Array.isArray(parsed_effects) ? parsed_effects : [parsed_effects];

        const all_found = [];
        for (let con of parsed_effects) {
            if (con.type === type) {
                let found = con[property];
                if (found === undefined || found === null) found = '';
                if (!find_all) return found
                else all_found.push(found)
            }
        }
        return all_found.join(', ');
    }

    /**
     * Create new Effect objects for the entered damage and consequences
     *
     * @param {string} damage - The damage to apply
     * @param {string} damage_type - The damage type in abbreviated format (e.g. cut, pi, sm)
     * @param {string} consequences - The names of any consequences to impose
     * @return {Effect[]}
     */
    create_effects(damage, damage_type, consequences) {
        const effects_list = [];

        if (damage !== '') {
            effects_list.push({
                type: "damage",
                value: damage,
                damage_type: damage_type,
                when: "success"
            });
        }

        if (consequences !== '') {
            const all_consequences = consequences.split(',').map(c => c.trim());
            for (let con of all_consequences)
                effects_list.push({
                    type: "consequence",
                    name: con,
                    when: "success"
                });
        }

        return effects_list;
    }

    /****************************************
     * METHODS THAT SUPPORT ORIGINS / PATHS *
     ****************************************/

    /**
     * Parses items in the provided fields of origins and paths
     *
     * @param {string} type - The type of SagaMachineItem
     * @param {string} property - The comma separated list of items to parse
     * @return {string}
     */
    items_provided(type, property) {

        if (!property) return '&horbar;';

        const return_list = [];
        const items_array = property.split(',').map(t => t.trim());
        for (let raw_name of items_array) {
            const match = this.matching_item(type, raw_name);
            const [item, name, specialization, rank] = [match.item, match.name, match.specialization, match.rank];
            if (!item) return_list.push(`<a class="content-link broken" draggable="true" data-type="${type}" data-name="${name}" data-specialization="${specialization}" data-rank="${rank}"><i class="fas fa-unlink"></i>${raw_name}</a>`);
            else return_list.push(`<a class="content-link" draggable="true" data-uuid="${item.uuid}" data-id="${item.id}" data-type="Item" data-specialization="${specialization}" data-rank="${rank}" data-tooltip="Item"><i class="fas fa-suitcase"></i>${raw_name}</a>`);
        }

        return return_list.join(', ');
    }

    /**
     * Find the SagaMachineItem that matches the name and specialization
     *
     * @param {string} type - The SagaMachineItem type
     * @param {string} raw_name - The raw name in "Name (Specialization) Rank" format
     * @return {{item: SagaMachineItem, name:string, specialization: string, rank: number|string}}
     */
    matching_item(type, raw_name) {
        // Extract rank
        let parts = raw_name.split(' ');
        let rank = parts[parts.length - 1];
        if (isNaN(Number(rank))) rank = '';

        // Extract specialization, if any
        let specialization = raw_name.match(/\(([^\)]+)\)/);
        if (specialization) specialization = specialization[specialization.length - 1];
        else specialization = '';

        // Extract name
        let name = raw_name.slice(0, raw_name.length - rank.length);
        parts = name.split('(');
        if (parts.length > 1) name = parts[0];
        name = name.trim()

        // Query for matching items, return null if not found
        const matches = game.items.filter(i => i.type === type && i.name === name);
        if (matches.length) return {item: matches[0], name: name, specialization: specialization, rank: rank}
        else return {item: null, name: name, specialization: specialization, rank: rank};
    }
}
