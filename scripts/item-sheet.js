/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class SagaMachineItemSheet extends ItemSheet {

    /** @inheritdoc */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["saga-machine", "sheet", "item"],
            width: 600,
            height: 400,
            tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "basics"}],
            scrollY: [".basics", ".attacks", ".description"]
        });
    }

    /**
     * Dynamically set the HTML template for the item type
     * @returns {string}
     */
    get template() {
        return `systems/saga-machine/templates/${this.item.type}-sheet.html`;
    }

    /** @inheritdoc */
	activateListeners(html) {
        super.activateListeners(html);

        // Handle attacks
        this.draw_attacks(html);
        html.find('.attacks .item-create').click(this.add_attack.bind(this));
        html.find('.attacks .item-delete').click(this.delete_attack.bind(this))
    }

    add_attack() {
        if ( !this.isEditable ) return;

        // Get the prototype attack node and parent node, return if it wasn't found
        const prototype = this.element.find('.attack.prototype');
        const parent = this.element.find('ol.attack-list');
        if (!prototype || !prototype.length || !parent || !parent.length) return;

        const clone = prototype.clone();
        clone.removeClass('prototype');
        clone.find('input, select').change(this.update_attacks.bind(this));
        parent.append(clone);
    }

    delete_attack(event) {
        const box = $(event.currentTarget).closest(".attack");
        const attack_list = box.closest('.attack-list');
        box.remove();
        this.update_attacks(event, attack_list);
    }

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
            clone.find("[name=stat]").val(attack.stat);
            clone.find("[name=skill]").val(attack.skill);
            clone.find("[name=damage]").val(this.find_damage(attack));
            clone.find("[name=damage_type]").val(this.find_damage_type(attack));
            clone.find("[name=targets]").val(attack.tn);
            clone.find("[name=consequences]").val(this.find_consequences(attack));
            parent.append(clone);

            // Set up the data handlers for the form, if this sheet is editable
		    if ( !this.isEditable ) continue;
            clone.find('input, select').change(this.update_attacks.bind(this));
        }
    }

    search_consequences(attack, type, property, find_all=false) {
        // Ensure that consequences are in the right format
        if (!attack.consequences || !attack.consequences.length) return '';
        let parsed_consequences = typeof attack.consequences === 'string' ?
            JSON.parse(attack.consequences) : attack.consequences;
        parsed_consequences = Array.isArray(parsed_consequences) ? parsed_consequences : [parsed_consequences];

        const all_found = [];
        for (let con of parsed_consequences) {
            if (con.type === type) {
                let found = con[property];
                if (found === undefined || found === null) found = '';
                if (!find_all) return found
                else all_found.push(found)
            }
        }
        return all_found.join(', ');
    }

    find_damage(attack) {
        return this.search_consequences(attack, 'damage', 'value');
    }

    find_damage_type(attack) {
        return this.search_consequences(attack, 'damage', 'damage_type');
    }

    find_consequences(attack) {
        return this.search_consequences(attack, 'consequence', 'name', true);
    }

    /**
     * Handle changes to the attack form
     *
     * @param event
     */
    update_attacks(event, attack_list=null) {
        event.preventDefault();
        event.stopPropagation();

        // Get all attacks
        const attack_nodes = attack_list ? attack_list.find('.attack:not(.prototype)') :
            $(event.currentTarget).closest('ol.attack-list').find('.attack:not(.prototype)');

        // Iterate over each node and add to the list
        const attacks = [];
        attack_nodes.each((i, node) => {
            let stat = $(node).find("[name=stat]").val().trim();
            let skill = $(node).find("[name=skill]").val().trim();
            let damage = $(node).find("[name=damage]").val().trim();
            let damage_type = $(node).find("[name=damage_type]").val().trim();
            let targets = $(node).find("[name=targets]").val().trim();
            let consequences = $(node).find("[name=consequences]").val().trim();

            if (!stat) return; // Don't add if no stat is specified

            attacks.push({
                stat: stat,
                skill: skill,
                tn: targets,
                consequences: this.create_consequences(damage, damage_type, consequences)
            });

            this.item.update({'system.attacks': attacks});
        });
    }

    create_consequences(damage, damage_type, consequences) {
        const consequences_list = [];

        if (damage !== '') {
            consequences_list.push({
                type: "damage",
                value: damage,
                damage_type: damage_type,
                when: "success"
            });
        }

        if (consequences !== '') {
            const all_consequences = consequences.split(',').map(c => c.trim());
            for (let con of all_consequences)
                consequences_list.push({
                    type: "consequence",
                    name: con,
                    when: "success"
                });
        }

        return consequences_list;
    }
}
