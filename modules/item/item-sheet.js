import Tagify from "../libraries/tagify.min.js";
import { SCORE_OPTIONS, STAT_OPTIONS } from "../game/tests.js";
import { ActionHelper, SagaMachineItem } from "./item.js";
import { ModifierSet } from "../game/modifiers.js";
import { mock_id } from "../system/utils.js";
import { Effect } from "../game/damage.js";

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
            scrollY: [".basics", ".actions", "effects", ".description"]
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
        return super.getData();
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

        // Handle actions
        html.find('.actions .item-create').click(this.add_action.bind(this));
        html.find('.actions .action-edit').click(this.edit_action.bind(this));
        html.find('.actions .action-delete').click(this.delete_action.bind(this));
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
     * METHODS THAT HANDLE ACTIONS *
     *******************************/

    /**
     * Add a new action to the list
     */
    add_action() {
        if (!this.isEditable) return;

        // Assemble the default action spec, based on item type and properties
        const spec = { name: this.item.name, type: "action", _id: mock_id(), img: this.item.img, system: {} };
        if (this.item.system.description) spec.system.description = this.item.system.description;
        if (this.item.type === 'item') {
            spec.system.properties = this.item.system.properties;
            if (this.item.system.group === 'Weapons') spec.system.group = 'Attacks';
        }
        if (this.item.type === 'skill') {
            spec.system.skill = this.item.system.full_name;
            spec.system.stat = this.item.system.default;
            if (this.item.system.group === 'Powers') spec.system.group = 'Powers';
            if (this.item.system.group === 'Maneuvers') spec.system.group = 'Attacks';
            if (this.item.system.group === 'Opening Moves') spec.system.group = 'Attacks';
            if (this.item.system.group === 'Stances') spec.system.group = 'Attacks';
        }

        const action = new SagaMachineItem(spec, { parent: this.item, parentCollection: this.item.collection });
        this.item.system.actions.push(action.toJSON());
        this.item.update({'system.actions': this.item.system.actions});
    }

    /**
     * Edit an action in the list
     *
     * @param {Event} event
     */
    edit_action(event) {
        const box = $(event.target).closest('.action');
        const index = box.data("id");

        if (index > this.item.system.actions.length) return;
        const action = new SagaMachineItem(this.item.system.actions[index],
            { parent: this.item, parentCollection: this.item.collection });
        action.sheet.render(true);
    }

    /**
     * Delete an action from the list
     *
     * @param {Event} event
     */
    delete_action(event) {
        const box = $(event.target).closest('.action')
        const index = box.data("id");
        this.item.system.actions.splice(index, 1);
        this.item.update({'system.actions': this.item.system.actions});
        box.remove();
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

/**
 * Item sheet functionality for skills
 */
export class SkillSheet extends SagaMachineItemSheet {
	/**
	 * @inheritdoc
	 * @override
	 * */
    getData() {
        const context = super.getData();

        // Add constant for item availability
        context.data.system.SKILL_DEFAULTS = SKILL_DEFAULTS;

        return context;
    }

	/**
	 * @inheritDoc
	 * @override
	 */
	activateListeners(html) {
		super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.isEditable) return;
	}
}

/**
 * Item sheet functionality for traits
 */
export class TraitSheet extends SagaMachineItemSheet {
	/**
	 * @inheritDoc
	 * @override
	 */
	activateListeners(html) {
		super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.isEditable) return;

        html.find('.effect-create').on('click', this.on_create_effect.bind(this));  // Create active effect
        html.find('.effect-edit').on('click', this.on_edit_effect.bind(this));      // Open active effect sheet
        html.find('.effect-delete').on('click', this.on_delete_effect.bind(this));  // Delete active effect
        html.find('.effect-toggle').on('click', this.on_toggle_effect.bind(this));  // Toggle effect on/off
	}
}

/**
 * Item sheet functionality for origins
 */
export class OriginSheet extends SagaMachineItemSheet {
	/**
	 * @inheritdoc
	 * @override
	 * */
    getData() {
        const context = super.getData();

        context.data.system.skills_provided = this.items_provided('skill', context.data.system.skills);
        context.data.system.traits_provided = this.items_provided('trait', context.data.system.traits);
        context.data.system.equipment_provided = this.items_provided('item', context.data.system.equipment);

        return context;
    }

	/**
	 * @inheritDoc
	 * @override
	 */
	activateListeners(html) {
		super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.isEditable) return;

        // Toggle edit/display of provided fields in origins/paths
        html.find('.items-provided').on("contextmenu", this.toggle_items_provided.bind(this));
	}
}

/**
 * Item sheet functionality for paths
 */
export class PathSheet extends SagaMachineItemSheet {
	/**
	 * @inheritdoc
	 * @override
	 * */
    getData() {
        const context = super.getData();

        context.data.system.skills_provided = this.items_provided('skill', context.data.system.skills);
        context.data.system.traits_provided = this.items_provided('trait', context.data.system.traits);
        context.data.system.equipment_provided = this.items_provided('item', context.data.system.equipment);

        return context;
    }

	/**
	 * @inheritDoc
	 * @override
	 */
	activateListeners(html) {
		super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.isEditable) return;

        // Toggle edit/display of provided fields in origins/paths
        html.find('.items-provided').on("contextmenu", this.toggle_items_provided.bind(this));
	}
}

/**
 * Item sheet functionality for consequence
 */
export class ConsequenceSheet extends SagaMachineItemSheet {
	/**
	 * @inheritDoc
	 * @override
	 */
	activateListeners(html) {
		super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.isEditable) return;

        html.find('.effect-create').on('click', this.on_create_effect.bind(this));  // Create active effect
        html.find('.effect-edit').on('click', this.on_edit_effect.bind(this));      // Open active effect sheet
        html.find('.effect-delete').on('click', this.on_delete_effect.bind(this));  // Delete active effect
        html.find('.effect-toggle').on('click', this.on_toggle_effect.bind(this));  // Toggle effect on/off
	}
}

/**
 * Item sheet functionality for items
 */
export class PhysicalItemSheet extends SagaMachineItemSheet {
	/**
	 * @inheritdoc
	 * @override
	 * */
    getData() {
        const context = super.getData();

        // Add constant for item availability
        context.data.system.ITEM_AVAILABILITY = ITEM_AVAILABILITY;

        return context;
    }

	/**
	 * @inheritDoc
	 * @override
	 */
	activateListeners(html) {
		super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.isEditable) return;
	}
}

/**
 * Item sheet functionality for ambitions
 */
export class AmbitionSheet extends SagaMachineItemSheet {
	/**
	 * @inheritdoc
	 * @override
	 * */
    getData() {
        const context = super.getData();

        // Add constant for ambition types
        context.data.system.AMBITION_TYPES = AMBITION_TYPES;

        return context;
    }
}

/**
 * Item sheet functionality for actions
 */
export class ActionSheet extends SagaMachineItemSheet {
    /**
     * @inheritdoc
     * @override
     * */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 550,
            height: 600
        });
    }

	/**
	 * @inheritdoc
	 * @override
	 * */
    getData() {
        const context = super.getData();

        // Add constant for ambition types
        context.data.system.STAT_OPTIONS = STAT_OPTIONS;
        context.data.system.SCORE_OPTIONS = SCORE_OPTIONS;

        return context;
    }

	/**
	 * @inheritDoc
	 * @override
	 */
	activateListeners(html) {
		super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.isEditable) return;

        // Initialize the Tagify widgets used for modifiers and properties
        const tag_inputs = html.find('.tag-input');
        for (const input of tag_inputs) {
            if (input.getAttribute('name') === 'system.modifiers' && Array.isArray(this.item.system.modifiers))
                input.value = this.item.system.modifiers.join(',');
            if (input.getAttribute('name') === 'system.properties' && Array.isArray(this.item.system.properties))
                input.value = this.item.system.properties.join(',');

            new Tagify(input, {
                duplicates: true,
                transformTag: tag_data => {
                    tag_data.style = ModifierSet.color(tag_data.value);
                    if (isNaN(parseInt(tag_data.value.split(" ").at(-1))))
                        tag_data.value = tag_data.value.replaceAll('+', '⊕').replaceAll('-', '⊖');
                }
            });
        }

        // Blank other score or stat with new selection
        const stat = html.find("select.stat[name='system.stat']");
        const score = html.find("select.score[name='system.stat']");
        stat.on('change', () => score.val(''));
        score.on('change', () => stat.val(''));

        // Handle effects
        this.draw_effects(html);
        html.find('.action-row .item-create').click(this.add_effect.bind(this));
        html.find('.action-row .item-delete').click(this.delete_effect.bind(this));
	}

    /**
     * Get the action form data, with special handling for stat, tags and effects
     *
     * @inheritDoc
     * @override
    */
    _getSubmitData(updateData={}) {
        const data = super._getSubmitData(updateData);

        // DATA FORMAT {
        //     "name": "Staunch Bleeding",
        //     "system.group": "Reactions",
        //     "system.stat": ["speed", ""],
        //     "system.skill": "Medicine",
        //     "system.tn": "12",
        //     "system.modifiers": '[{"value":"Aim ⊕","style":"--tag-bg:#9dd1ab"}]',
        //     "system.properties": "",
        //     "system.effects": "",
        //     "img": "icons/svg/item-bag.svg"
        // };

        // Special handling for stat / score
        if ('system.stat' in data && Array.isArray(data['system.stat']) && data['system.stat'].length >= 2)
            data['system.stat'] = !!data['system.stat'][0] ? data['system.stat'][0] : data['system.stat'][1];

        // Special handling for modifier / property tag widgets
        if ('system.modifiers' in data)
            try { data['system.modifiers'] = JSON.parse(data['system.modifiers']).map(m => m.value); } catch {}
        if ('system.properties' in data)
            try { data['system.properties'] = JSON.parse(data['system.properties']).map(m => m.value); } catch {}

        // Special handling for effects

        return data
    }

    /**
     * Handle submitting the form differently depending on whether the action is owned by an actor or an item
     *
     * @inheritDoc
     * @override
     */
    async _onSubmit(event, {updateData=null, preventClose=false, preventRender=false}={}) {
        event.preventDefault();

        // If owned by an item, merge into the parent's actions list and save
        if (this.item.parent instanceof SagaMachineItem) {
            // Get the form data
            const form_data = this._getSubmitData(updateData);

            // Remove unnecessary keys used for effects
            if ('consequence_name' in form_data)    delete form_data['consequence_name'];
            if ('consequence_subject' in form_data) delete form_data['consequence_subject'];
            if ('damage_type' in form_data)         delete form_data['damage_type'];
            if ('damage_value' in form_data)        delete form_data['damage_value'];
            if ('effect_target' in form_data)       delete form_data['effect_target'];
            if ('effect_type' in form_data)         delete form_data['effect_type'];
            if ('effect_when' in form_data)         delete form_data['effect_when'];
            if ('message_key' in form_data)         delete form_data['message_key'];
            if ('message_value' in form_data)       delete form_data['message_value'];

            // Merge in the updated data
            foundry.utils.mergeObject(this.item, form_data);

            // Get the index in the list, replace and save
            const index = ActionHelper.parent_action_index(this?.item?.parent, this.item.id);
            if (index >= 0) {
                this.item.parent.system.actions[index] = this.item.toObject(false);
                return await this.item.parent.update({'system.actions': this.item.parent.system.actions});
            }
        }

        // Otherwise, do things the usual way
        else return super._onSubmit(event,
            { updateData: updateData, preventClose: preventClose, preventRender: preventRender });
    }

    /*******************************
     * METHODS THAT HANDLE EFFECTS *
     *******************************/

    /**
     * Render the list of effects
     *
     * @param {JQuery} html
     */
    draw_effects(html) {
        // Don't draw effects if there are no effects
        if (!this.item.system.action_effects || !this.item.system.action_effects.length) return;

        // Get the prototype effect node and parent node, return if it wasn't found
        const prototype = html.find('.action-effect.prototype');
        const parent = html.find('ol.action-list');
        if (!prototype || !prototype.length || !parent || !parent.length) return;

        // For each effect, clone the prototype and set up the form
        for (let effect of this.item.system.action_effects) {
            const clone = prototype.clone();
            clone.removeClass('prototype');
            clone.find("[name=effect_type]").val(effect.type);
            if (effect.type === 'damage')       clone.find("[name=damage_value]").val(effect.value);
            if (effect.type === 'damage')       clone.find("[name=damage_type]").val(effect.damage_type);
            if (effect.type === 'consequence')  clone.find("[name=consequence_name]").val(effect.name);
            if (effect.type === 'consequence')  clone.find("[name=consequence_subject]").val(effect.subject);
            if (effect.type === 'message')      clone.find("[name=message_key]").val(effect.key);
            if (effect.type === 'message')      clone.find("[name=message_value]").val(effect.value);
            clone.find("[name=effect_when]").val(effect.when);
            clone.find("[name=effect_target]").val(effect.target);
            this.change_effect_type(clone)
            parent.append(clone);

            // Set up the data handlers for the form, if this sheet is editable
            if (!this.isEditable) continue;
            clone.find('input, select').change(this.update_effects.bind(this));
        }
    }

    change_effect_type(effect_row) {
        // Get the effect type and properties boxes
        const effect_type = effect_row.find('[name=effect_type]').val();
        const effect_props = effect_row.find('.action-props').children();
        if (!effect_row.length || !effect_type || !effect_props.length) return;

        // Toggle visibility of boxes, as appropriate for the type
        for (const box of effect_props)
            if (box.classList.contains(`action-${effect_type}`)) box.classList.remove('hidden');
            else box.classList.add('hidden');
    }

    /**
     * Add a new effect to the list
     */
    add_effect() {
        if (!this.isEditable) return;

        // Get the prototype effect node and parent node, return if it wasn't found
        const prototype = this.element.find('.action-effect.prototype');
        const parent = this.element.find('ol.action-list');
        if (!prototype || !prototype.length || !parent || !parent.length) return;

        const clone = prototype.clone();
        clone.removeClass('prototype');
        clone.find('input, select').change(this.update_effects.bind(this));
        parent.append(clone);
    }

    /**
     * Delete an effect from the list
     *
     * @param {Event} event
     */
    delete_effect(event) {
        const box = $(event.currentTarget).closest(".action-effect");
        const effect_list = box.closest('.action-list');
        box.remove();
        this.update_effects(event, effect_list);
    }

    /**
     * Handle changes to the effects form
     *
     * @param {Event} event
     * @param {JQuery} effect_list
     */
    async update_effects(event, effect_list = null) {
        event.preventDefault();
        event.stopPropagation();

        // Get all effects
        const effect_nodes = effect_list ? effect_list.find('.action-effect:not(.prototype)') :
            $(event.currentTarget).closest('ol.action-list').find('.action-effect:not(.prototype)');

        // Iterate over each node and add to the list
        const effects = [];
        effect_nodes.each((i, node) => {
            let type = $(node).find("[name=effect_type]").val().trim();

            let damage_value = $(node).find("[name=damage_value]").val().trim();
            let damage_type = $(node).find("[name=damage_type]").val().trim();

            let consequence_name = $(node).find("[name=consequence_name]").val().trim();
            let consequence_subject = $(node).find("[name=consequence_subject]").val().trim();

            let message_key = $(node).find("[name=message_key]").val().trim();
            let message_value = $(node).find("[name=message_value]").val().trim();

            let when = $(node).find("[name=effect_when]").val().trim();
            let target = $(node).find("[name=effect_target]").val().trim();

            // Create effect, add if valid, add it to the list
            let dataset = { type: type,  when: when, target: target };
            if (type === 'damage')
                dataset = { value: damage_value, damage_type: damage_type, ...dataset };
            else if (type === 'consequence')
                dataset = { name: consequence_name, subject: consequence_subject || null, ...dataset };
            else if (type === 'message')
                dataset = { key: message_key || null, value: message_value, ...dataset };
            try { effects.push(Effect.to_json(new Effect(dataset))); } catch (e) {}
        });

        if (this.item.parent instanceof SagaMachineItem) {
            await this.submit({ updateData: { 'system.action_effects': effects } });
            await this.render();
        }
        else this.item.update({ 'system.action_effects': effects });
    }

    /**
     * Return a JSON string representation of this action's effects - used in templates
     *
     * @return {string}
     */
    get effects_str() {
        return  JSON.stringify(this.item.system.action_effects.map(c => Effect.to_json(c)));
    }
}