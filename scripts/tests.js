import "./tagify.min.js";
import { capitalize, token_actor } from "./utils.js";

/**
 * Object representing a Saga Machine test
 */
export class Test {
    _actor = null;
    _label = null;

    target = null;
    target_score = null;
    critical = false;
    evaluated = false;
    margin = null;
    pairs = null;
    results = null;
    skill_value = 0;
    stat_value = 0;
    success = false;
    randomizer = null;
    total = null;
    use_pair = false;

    /**
     * Initialize from a dataset
     * @param dataset
     */
    constructor(dataset) {
        Object.assign(this, dataset);
        this.validate();
    }

    validate() {
        // Make sure the dataset has all the required components, throw an error if not
        let valid = (this.sceneId && this.tokenId || this.actorId || this.actor) && this.actor && this.actor.system &&
            (this.actor.system.stats[this.stat] || this.actor.system.scores[this.stat] || !this.stat);
        if (!valid)
            throw `Test missing required data: scene=${this.sceneId}, token=${this.tokenId}, actor=${this.actorId}, stat=${this.stat}`;

        // Ensure that numeric parts of the dataset are represented as numbers
        if (this.tn && !isNaN(this.tn)) this.tn = Number(this.tn);
        if (this.boons && !isNaN(this.boons)) this.boons = Number(this.boons); else this.boons = 0;
        if (this.banes && !isNaN(this.banes)) this.banes = Number(this.banes); else this.banes = 0;
        if (this.modifier && !isNaN(this.modifier)) this.modifier = Number(this.modifier); else this.modifier = 0;

        // Parse the consequences, if any
        if (this.consequences) {
            // If the consequences are already parsed, return
            if (Array.isArray(this.consequences) && this.consequences.every(c => c instanceof Consequence))
                return;

            // Otherwise, parse them if a string
            let consequence_list = null;
            if (typeof this.consequences === 'string') consequence_list = JSON.parse(this.consequences);
            else consequence_list = this.consequences;

            // And transform the into consequence objects
            if (!Array.isArray(consequence_list)) consequence_list = [consequence_list];
            for (let i = 0; i < consequence_list.length; i++)
                consequence_list[i] = new Consequence(consequence_list[i], this);
            this.consequences = consequence_list;
        }
    }

    set actor(actor) {
        this._actor = actor;
    }

    get actor() {
        if (this._actor) return this._actor;    // Return the cached actor, if available

        // Get the actor corresponding to the token, if any
        if (this.sceneId && this.tokenId) {
            const scene = game.scenes.get(sceneId);
            if (!scene) return null;
            const token_data = scene.items.get(tokenId);
            if (!token_data) return null;
            const token = new Token(token_data);
            this._actor = token.actor;
            return this._actor;
        }

        // Otherwise, get the canonical actor
        this._actor = game.actors.get(this.actorId) || null
        return this._actor;
    }

    /**
     * Generate the Saga Machine label for the test
     *
     * @returns {string}
     */
    get label() {
        if (this._label) return this._label;

        // Lazily generate the label
        const stat_label = this.stat ? capitalize(this.stat) : '1d10';
        const skill_label = this.skill ? `/${this.skill}` : '';
        const tn_label = this.tn ? (isNaN(this.tn) ? ` vs. ${this.tn}` : `-${this.tn}`) : '';
        this._label = stat_label + skill_label + tn_label;
        return this._label;
    }

    /**
     * Generate the roll string for the test, canceling out boons and banes
     *
     * @returns {string}
     */
    roll_syntax() {
        const total = this.boons - this.banes;
        if (total === 0) return '1d10';
        else if (total > 0) return `${total+1}d10kh1`;
        else return `${total*-1+1}d10kl1`;
    }

    /**
     * Take the roll results and look for pairs, adding them appropriately if there were boons
     *
     * @returns {null|(number|boolean)[]}
     */
    make_pairs() {
        // If there weren't any boons, there are no pairs
        if (this.banes >= this.boons) return [null, false];

        // Find the highest pair
        const found = [];
        let highest_pair = 0;
        for (let i of this.results.dice[0].results) {
            if (found.includes(i.result) && i.result > highest_pair) highest_pair = i.result;
            found.push(i.result);
        }

        // Is the highest pair better than the highest result?
        const use_pair = highest_pair * 2 > this.results.total;

        // Set the total and discards in the roll results
        let pairs = false;
        if (highest_pair * 2 > this.results.total) {
            pairs = highest_pair;
            this.results._total = highest_pair * 2;
            let active = 0;
            for (let i of this.results.dice[0].results) {
                if (i.result === highest_pair && active < 2) {
                    i.discarded = false;
                    active++;
                }
                else i.discarded = true;
            }
        }

        return [highest_pair, use_pair];
    }

    lookup_skill() {
        // Separate skill name from specialization
        let specialization = this.skill.match(/\(([^\)]+)\)/);
        if (specialization) specialization = specialization[specialization.length-1];
        let skill = specialization ? this.skill.split(' ')[0] : this.skill;

        // If no specialization, filter skills
        let matching_skills = [];
        if (!specialization) {
            matching_skills = this.actor.items.filter(item => item.type === 'skill' && item.name === skill);
        }

        // Otherwise, clean the specialization then filter
        else {
            specialization = specialization.replace(/[()]/g, '');
            matching_skills = this.actor.items.filter(item => item.type === 'skill' && item.name === skill &&
                item.system.specialization === specialization);
        }

        // If there are no matching skills, try searching by full name
        if (!matching_skills.length) {
            matching_skills = this.actor.items.filter(item => item.type === 'skill' && item.name === this.skill);
        }

        // If there are still no matching skills, return 0
        if (!matching_skills.length) return 0;

        // Otherwise, look up the rank and return
        else return Number(matching_skills[0].system.rank);
    }

    /**
     * Calculate the total of the test
     *
     * @returns {(*|number|number)[]}
     */
    calc_total() {
        // Look up the stat or score value
        let stat = this.stat ? (this.stat in this.actor.system.stats ?
            this.actor.system.stats[this.stat].value : this.actor.system.scores[this.stat].value) : 0;

        // Get the skill rank
        const relevant_skill = !!this.skill; // There is a skill for this test
        const skill = relevant_skill && this.skill !== 'Unskilled' ? // If falsy, the actor is unskilled
            this.lookup_skill() : 0;

        // Halve the stat in the case of unskilled tests
        if (relevant_skill && !skill) stat = Math.floor(stat / 2);

        // Which is greater? The highest pair or the highest single die
        const randomizer = this.pairs ?
            (this.pairs * 2 > this.results.total ? this.pairs * 2 : this.results.total) : this.results.total;

        // Return the total
        const total = randomizer + stat + skill + this.modifier;
        return [total, randomizer, stat, skill];
    }

    /**
     * Look up the Defense or Willpower TN of the targeted token
     *
     * @returns {(*|number|(function(): (null|null))|number)[]|boolean|number[]}
     */
    lookup_tn() {
        if (typeof this.tn !== 'string') return [this.tn, null, null];

        const is_defense = this.tn.toLowerCase() === 'defense';
        const is_willpower = this.tn.toLowerCase() === 'willpower';
        if (!is_defense && !is_willpower) return false;

        const actor = game?.user?.targets?.values()?.next()?.value?.actor;
        const scores = actor?.system?.scores;
        if (!scores) return [null, null, null];

        // Set properties and return
        const tn = is_defense ? scores.defense.tn : scores.willpower.tn;
        return [tn, actor, this.tn];
    }

    /**
     * Did the dice turn up double 1's?
     *
     * @returns {boolean}
     */
     double_ones() {
        let one_count = 0;
        for (let i of this.results.dice[0].results)
            if (i.result === 1) one_count++;
        return one_count >= 2;
    }

    /**
     * Calculate the margin of success or failure from the TN and total
     *
     * @returns {(boolean|number)[]}
     */
    calc_margin() {
        // Handle unknown TN
        if (!this.tn) return [null, null, null];

        // Calculate margin, success and criticals
        let margin = Math.abs(this.total - this.tn);
        let success = this.total >= this.tn;
        let critical = margin >= this.tn || this.total < this.tn/2;

        // Also check for double 1's on a bane being a critical failure
        if (this.banes > this.boons && this.double_ones()) {
            if (success) {
                success = false;
                margin = 0;
            }
            critical = true;
        }

        return [success, critical, margin];
    }

    /**
     * Evaluate the test
     *
     * @returns RollResults
     */
    async evaluate() {
        // Perform the roll and get the results
        const roll_str = this.roll_syntax();
        const roll = new Roll(roll_str);
        this.results = await roll.evaluate();

        // Make pairs and calculate the total
        [this.pairs, this.use_pair] = this.make_pairs();
        [this.total, this.randomizer, this.stat_value, this.skill_value] = this.calc_total();

        // Determine success, critical and calculate the margin
        [this.tn, this.target, this.target_score] = this.lookup_tn();
        [this.success, this.critical, this.margin] = this.calc_margin();

        // Mark as evaluated and return
        this.evaluated = true;
        return this;
    }

    async apply_consequences(dataset) {
        if (!this.consequences) this.consequences = []; // Init consequences, if needed
        const properties = dataset?.properties || this.properties || [];
        if (!this.consequences_evaluated) {
            // Handle extra hits and shots from the Auto property
            if (Attack.has_property(properties, 'Auto')) {
                const base_attack = this.basic_attack_damage() || {value: 0, damage_type: 'sm'};
                for (let m_count = this.margin - 5; m_count > 0; m_count -= 5)
                    this.consequences.push(new Consequence({
                        type: 'damage',
                        value: base_attack.value,
                        damage_type: base_attack.damage_type,
                        margin: m_count,
                        when: 'success',
                        target: 'target',
                        properties: properties
                    }, this));
                this.consequences.push(new Consequence({
                    type: 'message',
                    key: 'Ammo',
                    value: `Automatic fire consumes ${Attack.property_value(properties, 'Auto')} shots.`
                }, this));
            }

            // Handle the Stun property
            if (Attack.has_property(properties, 'Stun'))
                this.consequences.push(new Consequence({ type: 'consequence', name: 'Stun', when: 'success', target: 'target' }, this));

            const ordering = ['defense', 'damage', 'consequence', 'message'];
            this.consequences.sort((a, b) => {
                if (ordering.indexOf(a.type) > ordering.indexOf(b.type)) return 1;
                if (ordering.indexOf(a.type) < ordering.indexOf(b.type)) return -1;
                if (ordering.indexOf(a.type) === ordering.indexOf(b.type)) return 0;
            });
            this.consequences_evaluated = true;
        }

        // Apply consequences
        const when = this.success ? 'success' : (this.tn ? 'failure' : 'always');
        for (let c of this.consequences) c.apply(when, dataset);
    }

    basic_attack_damage() {
        const damage_consequences = this.consequences.filter(c => c.type === 'damage');
        if (damage_consequences.length) return damage_consequences[0];
        else return null;
    }

    flavor() {
        // Create target and result messages
        const target_message = this.target ?
            `<div><strong>Target:</strong> ${this.target.name} (${capitalize(this.target_score)} ${this.tn})</div>` : '';
        const success_message = (this.critical ? 'Critical ' : '') +
            (this.target_score ? (this.success ? 'Hit!' : 'Miss!') : (this.success ? 'Success!' : 'Failure!'));
        const success_class = (this.critical ? 'critical ' : '') + (this.success ? 'success' : 'failure');
        const result_message = this.tn ?
            `<div><strong>Result:</strong> <span class="${success_class}">${success_message}</span> Margin ${this.margin}</div>` : '';

        // Create the consequence message, if any
        let consequence_message = '';
        if (this.consequences)
            for (let c of this.consequences)
                consequence_message += c.message;

        // Create the tags
        let tags = '';
        if (!!this.stat) tags += `<span class="tag">${capitalize(this.stat)} +${this.stat_value}</span>`;
        if (!!this.skill && this.skill !== 'Unskilled') tags += `<span class="tag">${this.skill} +${this.skill_value}</span>`;
        if (this.skill && this.skill_value === 0) tags += '<span class="tag">Unskilled</span>';
        if (!!this.tags && this.tags.length) this.tags.forEach(t => tags += `<span class="tag">${t}</span>`);
        if (this.use_pair) tags += '<span class="tag">Pairs!</span>';
        if (this.use_luck) tags += '<span class="tag">Luck</span>';
        if (this.edited) tags += '<span class="tag">Edited</span>';

        // Return the result
        return `<h4 class="action">${this.label}</h4>
                ${target_message} 
                ${result_message} 
                ${consequence_message}
                <hr />
                <div class="tags">${tags}</div>`;
    }

    /**
     * Generate the expanded roll for the test, to be output as a card in chat
     *
     * @returns {string}
     * @private
     */
    dice_html() {
        let to_return = '<ol class="dice-rolls">';
        for (let i of this.results.dice[0].results) {
            const discarded = i.discarded ? 'discarded' : '';
            to_return += `<li class="roll die d10 ${discarded}">${i.result}</li>`;
        }

        to_return += '</ol>';
        return to_return;
    }

    content() {
        const stat_span = this.stat_value ? `+ <span title="Stat">${this.stat_value}</span>` : '';
        const skill_span = this.skill_value ? `+ <span title="Skill">${this.skill_value}</span>` : '';
        const modifier_span = this.modifier ? `+ <span title="Modifier">${this.modifier}</span>` : '';
        const test_json = JSON.stringify(Test.to_json(this));

        return `
            <div class="dice-roll">
                <div class="dice-result">
                    <div class="dice-formula">
                        ${this.results.formula} ${skill_span} ${stat_span} ${modifier_span}
                    </div>
                    <div class="dice-tooltip">
                        <section class="tooltip-part">
                            <div class="dice">
                                <header class="part-header flexrow">
                                    <span class="part-formula">${this.results.formula}</span>
                                    <span class="part-total">${this.results.total}</span>
                                </header>
                                ${this.dice_html()}
                            </div>
                        </section>
                    </div>
                    <h4 class="dice-total">${this.total}</h4>
                </div>
            </div>
            <input type="hidden" class="test-json" value='${test_json}' />`;
    }

    async to_chat({ whisper= false, rolls= null }) {
        // Create the chat message
        const message = await this.results.toMessage({}, {create: false });
        message.flavor = this.flavor();
        message.content = this.content();
        message.speaker = ChatMessage.getSpeaker({ actor: this.actor });

        // Set the roll, if a custom one was provided
        if (rolls) {
            if (!Array.isArray(rolls)) rolls = [rolls];                     // Ensure this is an array
            message.rolls = rolls.map(r => JSON.stringify(r.toJSON()));     // Convert to what ChatMessage expects
        }

        // Set as a whisper, if requested
        if (whisper) {
            message.type = CONST.CHAT_MESSAGE_TYPES.WHISPER;
            message.whisper = game.users.filter(u => u.isGM || u.character?.id === this.actor?.id ).map(u => u.id);
        }

        // Send the message to chat
        await ChatMessage.create(message);
    }

    static to_json(test) {
        const json = {};
        for (let [key, value] of Object.entries(test)) {
            // For basic data, copy it over to the JSON
            if (typeof value === 'string' || typeof value === 'number' ||
                typeof value === 'boolean' || value === null)
                json[key] = value;

            // Special handling for _actor and target
            else if (key === '_actor' || key === 'target') {
                // If not a token actor, copy over actor ID
                if (!value.isToken) json[key] = { actor_id: value.id };

                // If a token actor, copy over token and scene IDs
                else json[key] = { token_id: value.token.id, scene_id: value.token.parent.id };
            }

            // Special handling for consequences
            else if (key === 'consequences') {
                const con_json = [];
                for (let con of test.consequences)
                    con_json.push(Consequence.to_json(con));
                json[key] = con_json;
            }

            // Special handling for results
            else if (key === 'results')
                json[key] = {
                    _evaluated: value._evaluated,
                    _formula: value._formula,
                    _total: value._total,
                    _terms: value.terms[0].results
                };
        }

        return json;
    }

    static from_json(obj) {
        const dataset = {};
        for (let [key, value] of Object.entries(obj)) {
            // For basic data, copy it over to the JSON
            if (typeof value === 'string' || typeof value === 'number' ||
                typeof value === 'boolean' || value === null)
                dataset[key] = obj[key]

            // Special handling for _actor and target
            else if (key === '_actor' || key === 'target') {
                if (value instanceof game.sagamachine.SagaMachineActor) dataset[key] = value;
                else dataset[key] = token_actor({
                    scene_id: value.scene_id,
                    token_id: value.token_id,
                    actor_id: value.actor_id
                });
            }

            // Special handling for consequences
            else if (key === 'consequences') dataset[key] = value;

            // Special handling for results
            else if (key === 'results') {
                dataset[key] = new Roll(value._formula);
                dataset[key]._evaluated = value._evaluated;
                dataset[key]._formula = value._formula;
                dataset[key]._total = value._total;
                dataset[key].terms = [new Die({faces: 10})];
                dataset[key].terms[0].results = value._terms;
            }
        }

        return new Test(dataset);
    }
}

/**
 * Object representing the consequences of a test
 */
export class Consequence {
    test = null;
    type = null;        // Valid values are 'consequence', 'damage' and 'defense'
    target = 'self';    // Valid values are 'self' and 'target'
    when = 'always';    // Valid values are 'success', 'failure' and 'always'
    message = ''

    static IGNORES_ALL_ARMOR = -1;

    constructor(dataset, test=null) {
        Object.assign(this, dataset);   // Assign properties from the dataset
        if (test) this.test = test;     // Assign the test
        this.validate(dataset);         // Validate the dataset
    }

    validate() {
        if (!['consequence', 'damage', 'defense', 'message'].includes(this.type))
            throw `Unknown type ${this.type}`;
    }

    right_time(when) {
        return this.when === 'always' || this.when === when;
    }

    format_message(key, value) {
        return `<div><strong>${key}:</strong> ${value}</div>`;
    }

    effect() {
        if (this.type === 'damage') return `${this.value} ${this.damage_type}`;
        else if (this.type === 'consequence') return this.name;
        else return 'Special';
    }

    consequence_link(name=null) {
        // If no provided name, use the default one
        if (!name) name = this.name;

        // Get the consequence, if it exists as an item
        let consequence = game.items.filter(item => item.type === 'consequence' && item.name === name);
        if (!consequence || !consequence.length) return name;
        return `<a class="content-link" draggable="true" data-uuid="Item.${consequence[0].id}" data-id="${consequence[0].id}" data-type="Item" data-tooltip="Item"><i class="fas fa-suitcase"></i>${name}</a>`;
    }

    base_damage() {
        let damage = 0;

        // Search damage string for each stat and apply
        let str_dmg = String(this.value).toLowerCase();
        if (str_dmg.includes('str')) damage += Number(this?.test?.actor?.system?.stats?.strength?.value);
        if (str_dmg.includes('dex')) damage += Number(this?.test?.actor?.system?.stats?.dexterity?.value);
        if (str_dmg.includes('spd')) damage += Number(this?.test?.actor?.system?.stats?.speed?.value);
        if (str_dmg.includes('end')) damage += Number(this?.test?.actor?.system?.stats?.endurance?.value);
        if (str_dmg.includes('int')) damage += Number(this?.test?.actor?.system?.stats?.intelligence?.value);
        if (str_dmg.includes('per')) damage += Number(this?.test?.actor?.system?.stats?.perception?.value);
        if (str_dmg.includes('chr')) damage += Number(this?.test?.actor?.system?.stats?.charisma?.value);
        if (str_dmg.includes('det')) damage += Number(this?.test?.actor?.system?.stats?.determination?.value);

        // Strip the damage string of any alphabetic characters, add and return
        str_dmg = str_dmg.replace(/[^\d.-]/g, '');
        damage += Number(str_dmg);
        return damage;
    }

    apply(when='always', dataset) {
        if (!dataset) dataset = this;

        if (this.type === 'consequence' && this.right_time(when))    this.apply_consequence();
        if (this.type === 'damage' && this.right_time(when))         this.apply_damage(dataset);
        if (this.type === 'defense' && this.right_time(when))        this.apply_defense();
        if (this.type === 'message' && this.right_time(when))        this.apply_message();

        return this;
    }

    apply_message() {
        this.message = this.format_message(this.key ? this.key : 'Message', this.value);
    }

    apply_consequence() {
        // Attach subject to name if specified
        const clean_name = this.name ? this.name : 'Unknown';
        const full_name = this.subject ? `${clean_name} (${this.subject})` : clean_name;

        // Create the embedded consequence link
        let link = this.consequence_link(full_name);
        if (!link) link = full_name;

        // Set the message
        this.message = this.format_message('Consequence', link);
    }

    apply_damage(dataset) {
        // Calculate the damage
        let base_damage = this.base_damage();                         // Base damage
        let margin = this.margin ? Number(this.margin) :              // Get the margin
            (this.test && this.test.margin ? Number(this.test.margin) : 0);

        // Handle the Feeble property
        this.properties = Attack.parse_properties(dataset.properties);
        if (Attack.has_property(this.properties, 'Feeble'))
            margin = Math.min(base_damage, margin);

        // Handle the Ignores and Pierce properties
        const ignores = Attack.has_property(this.properties, 'Ignores');
        const pierce = ignores ? Consequence.IGNORES_ALL_ARMOR : Attack.property_value(this.properties, 'Pierce');

        let damage = base_damage + margin;                              // Add base damage and margin
        if (damage < 0) damage = 0;                                     // Minimum 0

        // Get the damage type
        const damage_type = this.damage_type ? this.damage_type : '';

        // Set the message
        this.message = this.format_message('Damage',
            `<span class="damage" data-pierce="${pierce}">${damage}</span> <span class="damage-type">${damage_type}</span>`);
    }

    /**
     * Update the actor's Defense and Willpower TNs after a Defense roll
     */
    apply_defense() {
        if (!this.test) return; // If no test is know, nothing to do now

        // Get the target
        let target = null;
        if (this.target === 'self')                             target = this.test.actor;
        else if (this.target === 'target' && this.test.target)  target = this.test.target;

        // Calculate the TNs
        const defense_tn = target.system.scores.defense.value + this.test.randomizer;
        const willpower_tn = target.system.scores.willpower.value + this.test.randomizer;

        // Update defense and willpower
        target.update({'system.scores.defense.tn': defense_tn});
        target.update({'system.scores.willpower.tn': willpower_tn});

        // Set the message
        this.message = this.format_message('Defense', `TN ${defense_tn}`) +
            this.format_message('Willpower', `TN ${willpower_tn}`);
    }

    static to_json(test) {
        const json = {};
        for (let [key, value] of Object.entries(test)) {
            // For basic data, copy it over to the JSON
            if (typeof value === 'string' || typeof value === 'number' ||
                typeof value === 'boolean' || value === null || key === 'properties')
                json[key] = value;
        }

        return json;
    }

    static from_json(obj) {
        return new Consequence(obj);
    }
}

/**
 * Object representing an Attack test
 */
export class Attack extends Test {
    _consequences_string = null;
    _effect = null;

    get full_name() {
        return this.name || "Unnamed Attack";
    }

    get consequences_string() {
        // Return cached version
        if (this._consequences_string) return this._consequences_string;

        // Or lazily generate the string and return
        this._consequences_string = this.consequences ?
            JSON.stringify(this.consequences.map(c => Consequence.to_json(c))) : "[]";
        return this.consequences_string;
    }

    get effect() {
        // Return cached version
        if (this._effect) return this._effect;

        // If there are no consequences specified, return empty string, otherwise, compile the list of effects
        this._effect = this.consequences ? this.consequences.map(c => c.effect()).join(', ') : '';
        return this._effect
    }

    static is_attack(dataset) {
        return dataset.tn === 'Defense' || dataset.tn === 'Willpower';
    }

    static strength_met(dataset, actor=null) {
        // Get a reference to the actor if one has not been provided
        if (!actor) actor = token_actor({
            scene_id: dataset.sceneId,
            token_id: dataset.tokenId,
            actor_id: dataset.actorId
        });

        const strength = actor.system.stats.strength.value;                     // Get the actor's strength
        const damage = Attack.damage(dataset);                                  // Get the attack's damage
        const properties = Attack.parse_properties(dataset.properties);
        const light = Attack.property_value(properties, 'Light');       // Get the Light X property, if any
        const hands = Attack.property_value(properties, 'Hands');  // Get the Hands X property

        // Check to see if the strength requirement is met
        if (hands >= 2) return strength >= (light || (damage/2))
        else            return strength >= (light || damage)
    }

    static damage(dataset) {
        if (!dataset.consequences) return 0;

        // Parse consequences into a list
        let consequence_list = JSON.parse(dataset.consequences);
        if (!Array.isArray(consequence_list)) consequence_list = [consequence_list];

        // Get the damage
        for (let i = 0; i < consequence_list.length; i++) {
            const consequence = new Consequence(consequence_list[i]);
            if (consequence.type === 'damage') return consequence.base_damage();
        }

        return 0;
    }

    static parse_properties(properties) {
        if (typeof properties === 'string') return properties.split(',').map(t => t.trim());
        else if (Array.isArray(properties)) return properties;
        else return [];
    }

    static property_value(properties, property) {
        for (const prop of Attack.parse_properties(properties)) {
            if (prop.toLowerCase().startsWith(`${property.toLowerCase()} `)) {
                const [p, val] = prop.split(' ');
                return Number(val);
            }
        }
        return 0;
    }

    static has_property(properties, property) {
        return Attack.parse_properties(properties).map(p => p.split(' ')[0]).includes(property);
    }
}

export class ModifierSet {
    _name = null;
    _description = null;
    boons = 0;
    banes = 0
    modifier = 0;
    divide = 0;
    percent = 0;

    constructor({name=null, description=null, boons=0, banes=0, modifier=0, divide=0, percent=0}) {
        this._name = name;
        this._description = description;
        this.boons = parseInt(boons) || 0;
        this.banes = parseInt(banes) || 0;
        this.modifier = parseInt(modifier) || 0;
        this.divide = parseInt(divide) || 0;
        this.percent = parseInt(percent) || 0;
    }

    get name() { return this._name ? `${this._name} ${this.mod_str()}` : this.mod_str() }

    get description() { return this._description || this._name }

    mod_str() {
        const boons_banes = '⊕'.repeat(this.boons) + '⊖'.repeat(this.banes);
        const mod = this.modifier >= 0 ? `+${this.modifier}` : `${this.modifier}`;
        if (!boons_banes) return mod;
        else if (!this.modifier) return boons_banes;
        else return boons_banes + mod;
    }

    tag() {
        return { value: this.name, title: this.description, style: ModifierSet.color(this.name) }
    }

    json() {
        return {
            "boons": this.boons,
            "banes": this.banes,
            "modifier": this.modifier,
            "divide": this.divide,
            "percent": this.percent,
            "name": this.name,
            "description": this.description
        };
    }

    /**
     * Accepts list of raw key/value strings and returns a list of ModifierSet objects
     *
     * Ex: name=short_name&description=for_tooltip&boons=0&banes=0&modifier=0&divide=0&percent=0
     *
     * @param raw_mods_list
     * @returns {*[]}
     */
    static parse(raw_mods_list) {
        let mods_list = [];
        try {
            raw_mods_list.forEach(m => {
                const params = new URLSearchParams(m);
                mods_list.push(new ModifierSet({
                    name: params.get('name'),
                    description: params.get('description'),
                    boons: params.get('boons'),
                    banes: params.get('banes'),
                    modifier: params.get('modifier'),
                    divide: params.get('divide'),
                    percent: params.get('percent')
                }));
            });

            return mods_list;
        }
        catch (e) { console.error(`Error parsing modifiers object: ${raw_mods_list}`); return []; }
    }

    static color(name) {
        const includes_plus = name.includes('+') || name.includes('⊕');
        const includes_minus = name.includes('-') || name.includes('⊖');

        const GRAY = '--tag-bg:#a1a1a1;--tag-text-color:#2b2a2a;--tag-hover:#bababa;--tag-remove-bg:#a1a1a1;--tag-remove-btn-color:#2b2a2a';
        const RED = '--tag-bg:#d19d9d;--tag-text-color:#530d0d;--tag-hover:#e1b4b4;--tag-remove-bg:#d19d9d;--tag-remove-btn-color:#530d0d';
        const GREEN = '--tag-bg:#9dd1ab;--tag-text-color:#224939;--tag-hover:#b5e0c1;--tag-remove-bg:#9dd1ab;--tag-remove-btn-color:#224939';

        if (includes_plus && includes_minus) return GRAY;
        else if (includes_plus) return GREEN;
        else if (includes_minus) return RED;
        else return GRAY;
    }

    static total_modifiers(mods_list) {
        let boons = 0;
        let banes = 0;
        let modifier = 0;
        let divide = 0;
        let percent = 0;
        let tags = [];

        // Add up the totals
        mods_list.forEach(m => {
            boons += m.boons || 0;
            banes += m.banes || 0;
            modifier += m.modifier || 0;
            divide += m.divide || 0;
            percent += m.percent || 0;
            if (!!m.name) tags.push(m.name);
        });

        return { boons: boons, banes: banes, modifier: modifier, divide: divide, percent: percent, tags: tags };
    }

    static list_from_string(input_str) {
        let json_list = null;
        try { json_list = JSON.parse(input_str); }
        catch (e) { console.error("Error parsing list from tagify"); }

        if (!json_list) return [];
        if (!Array.isArray(json_list)) json_list = [json_list];

        return json_list.map(t => ModifierSet.from_tag(t));
    }

    static from_tag(tag_json) {
        // '[{"value":"Dazed ⊖","title":"Dazed","color":"red"},{"value":"Confused ⊕"},{"value":"Skilled +2"}]'
        if (!tag_json.value) return {};

        // Parse the tag name
        const parts = tag_json.value.split(" ");
        const all_mods = parts.pop();
        const name = parts.join(" ");

        // Count boons, banes and mod
        let modifier = parseInt(all_mods.replace(/^\D+/, '')) || null;
        let leading = all_mods.replace(/[0-9]/g, '');
        if (modifier !== null && leading.at(-1) === '-') modifier *= -1; // If mod is negative, make it so
        if (modifier !== null) leading = leading.slice(0, -1);
        let boons = (leading.match(/[+⊕]/g) || []).length ;
        let banes = (leading.match(/[-⊖]/g) || []).length ;

        return new ModifierSet({
            name: name.replace(/[⊕⊖]/g, ''),
            boons: boons,
            banes: banes,
            modifier: modifier || 0
        });
    }
}

/**
 * Show a test dialog for the test provided in the dataset
 *
 * @param dataset
 * @returns {Promise<void>}
 * @private
 */
export async function test_dialog(dataset) {
    const actor = token_actor({
        scene_id: dataset.sceneId,
        token_id: dataset.tokenId,
        actor_id: dataset.actorId
    });

    const dialog_content = await renderTemplate("systems/saga-machine/templates/test-dialog.html",
        { ...actor.sheet.getData(), ...dataset });

    new Dialog({
        title: "Make Test",
        content: dialog_content,
        render: html => {
            // Initialize the modifiers (tag) widget
            const modifiers = actor.modifiers(dataset);         // Get the list of modifiers from consequences
            const input = html.find('input[name=modifiers]');   // Get the modifiers input DOM element
            if (!input) return;
            input.val(JSON.stringify(modifiers.map(m => m.tag())));
            const tagify = new Tagify(input[0], {
                duplicates: true,
                transformTag: tag_data => {
                    tag_data.style = ModifierSet.color(tag_data.value);
                    if (isNaN(parseInt(tag_data.value.split(" ").at(-1))))
                        tag_data.value = tag_data.value.replaceAll('+', '⊕').replaceAll('-', '⊖');
                }
            });

            // Redo modifiers when the stat, score or TN is changed
            const inputs = html.find('select[name=stat], select[name=score], input[name=tn]');
            inputs.on('change', event => {
                // Get the new test parameters
                const modified_dataset = foundry.utils.deepClone(dataset);
                dataset.stat = html.find('select[name=stat]').val();
                dataset.score = html.find('select[name=score]').val();
                dataset.tn = html.find('input[name=tn]').val();

                // Get the new modifiers and set the tag widget
                const new_modifiers = actor.modifiers(modified_dataset);
                input.val(JSON.stringify(new_modifiers.map(m => m.tag())));
            });
        },
        buttons: {
            roll: {
                label: "Make Test",
                callback: async (html) => {
                    html.find('select[name=stat] > option:selected').trigger('focus');
                    setTimeout(async () => { // Wait for unfocus event on modifier widget
                        // Gather form data
                        let stat = html.find('select[name=stat] > option:selected').val();
                        let score = html.find('select[name=score] > option:selected').val();
                        let skill = html.find('select[name=skill] > option:selected').val();
                        const { boons, banes, modifier, tags } = ModifierSet.total_modifiers(
                            ModifierSet.list_from_string(html.find('input[name=modifiers]').val())
                        );
                        const tn = html.find('input[name=tn]').val();
                        const consequences = html.find('input[name=consequences]').val();

                        // Create and evaluate the test
                        const test = new Test({
                            actor: actor,
                            stat: stat || score,
                            skill: skill || null,
                            boons: boons || 0,
                            banes: banes || 0,
                            modifier: modifier || 0,
                            tags: tags,
                            tn: tn || null,
                            consequences: consequences || null
                        });
                        await test.evaluate();

                        // Apply any immediate test consequences
                        await test.apply_consequences(dataset);

                        // Send the message to chat
                        const whisper = !!dataset['whisper'];
                        await test.to_chat({whisper: whisper});
                    }, 200);
                },
                icon: `<i class="fas fa-check"></i>`
            }
        },
        default: "roll"
    }).render(true, {width: 450});
}

/**
 * Create a Macro from an Item drop. Get an existing item macro if one exists, otherwise create a new one.
 *
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
export async function create_hotbar_macro(data, slot) {
    // Only create macro for tests
    if (data.type !== 'Test') return;

    // Verify that the actor may be retrieved
    const actor = token_actor({
        scene_id: data['sceneId'],
        token_id: data['tokenId'],
        actor_id: data['actorId']
    });
    if (!actor) return ui.notifications.warn("You can only create macro buttons for known actors");

    // Generate the test label
    const test = new Test({
        actor: actor,
        stat: data['stat'] || data['score'],
        skill: data['skill'],
        tn: data['tn']
    });
    const label = test.label

    // Get the icon, if any
    let skill = null;
    if (!!data['skill']) skill = game.items.find(i => i.name === data['skill'] && i.type === 'skill');

    // Create the macro command
    const data_string = JSON.stringify(data);
    const command = `game.sagamachine.sm_test_macro(${data_string});`;
    let macro = game.macros.find(m => (m.name === label) && (m.command === command));
    let macro_spec = { name: label, type: "script", command: command, flags: { "sagamachine.sm_test_macro": true }};
    if (skill) macro_spec['img'] = skill.img;
    if (!macro) macro = await Macro.create(macro_spec);

    // Assign to the hotbar
    game.user.assignHotbarMacro(macro, slot);
    return false;
}

/**
 * Create a Macro from an Item drop. Get an existing item macro if one exists, otherwise create a new one.
 *
 * @param {string} dataset
 */
export async function sm_test_macro(dataset) {
    // Get the actor from any embedded IDs
    let actor = token_actor({
        scene_id: dataset['sceneId'],
        token_id: dataset['tokenId'],
        actor_id: dataset['actorId']
    });

    // If no actor is available, look up using the speaker
    if (!actor) {
        const speaker = ChatMessage.getSpeaker();
        if (speaker.token) actor = game.actors.tokens[speaker.token];
        if (!actor) actor = game.actors.get(speaker.actor);
        dataset['actorId'] = actor.id
    }

    await test_dialog(dataset);
}

/**
 * Test Drop: Create macro in hotbar
 */
Hooks.once("ready", async function() {
  Hooks.on("hotbarDrop", (bar, data, slot) => create_hotbar_macro(data, slot));
});

/**
 * Drag Chat Card: Attach test data to chat card
 */
Hooks.on("renderChatMessage", async (app, html, msg) => {
    if (!html.find('.damage').length) return;  // Do nothing if no damage to attach

    // Is the first hit a critical hit?
    let critical = !!html.find('.critical').length;

    // Gather data for all hits
    const hits = [];
    html.find('.damage').each((i, e) => {
        const damage = Number($(e).text());
        const damage_type = $(e).parent().find('.damage-type').text();
        const pierce_armor = Number($(e).data('pierce')) || 0;
        hits.push({ damage: damage, damageType: damage_type, critical: critical, pierce: pierce_armor });
        critical = false; // Subsequent hits aren't critical
    });

    // Attach drag listener
    html[0].setAttribute("draggable", true);	// Add draggable and dragstart listener
    html[0].addEventListener("dragstart", ev => {
        ev.currentTarget.dataset['hits'] = JSON.stringify(hits);
		ev.dataTransfer.setData("text/plain", JSON.stringify({ hits: hits }));
    }, false);
});

/**
 * Drop Chat Card: Apply damage to target
 */
Hooks.on("dropActorSheetData", async (actor, sheet, data) => {
    if (data['hits'])
        for (let hit of data['hits'])
            await actor.apply_damage(hit['damage'], hit['damageType'], hit['critical'], hit['pierce']);
});

/**
 * Chat Card Menu: Add apply damage and push your luck
 */
Hooks.on("getChatLogEntryContext", (html, options) => {
    // Push Your Luck option
    options.push({
        name: 'Push Your Luck',
        icon: '<i class="fas fa-dice"></i>',
        condition: html => !!html.find('.test-json').length,
        callback: async html => {
            // Recreate test object from json
            const test = Test.from_json(JSON.parse(html.find('.test-json').val()));

            // Check for ownership
            if (!test?.actor?.isOwner)
                return ui.notifications.warn("You can't Push Your Luck for this character.");

            // Check for enough luck
            if (test?.actor?.system?.scores?.luck?.value <= 0)
                return ui.notifications.warn("The character doesn't have enough Luck.");

            // Add additional boon, mark luck tag and re-evaluate
            test.boons++;
            test.use_luck = true;
            await test.evaluate()

            // Decrement luck
            test.actor.update({'system.scores.luck.value': test.actor.system.scores.luck.value - 1});

            // Apply any immediate test consequences
            await test.apply_consequences();

            // Display the new chat card
            await test.to_chat({ whisper: html.hasClass('whisper'), rolls: [test.results] });
        }
    });


    // Apply Damage option
    options.push({
        name: 'Apply Damage',
        icon: '<i class="fas fa-user-minus"></i>',
        condition: html => !!html.find('.damage').length,
        callback: html => {
            // Get all selected tokens
            let tokens = game?.canvas?.tokens?.controlled;

            // If there are no valid tokens, and you are the GM, give a warning
            if (!tokens.length && game.user.isGM) { ui.notifications.warn("No valid character selected."); return; }

            // Filter for owned token actors, falling back to player character is none are selected
            let valid_tokens = tokens.filter(t => t?.document?.actor?.isOwner)
            if (!valid_tokens.length && game.user.character) valid_tokens = [game.user.character];

            // For all valid actors
            for (let token of valid_tokens) {
                let actor = token?.document?.actor;
                if (actor && actor.isOwner) {
                    // Is the first hit a critical hit?
                    let critical = !!html.find('.critical').length;

                    // Apply each damage
                    html.find('.damage').each((i, e) => {
                        const damage = Number($(e).text());
                        const damage_type = $(e).parent().find('.damage-type').text();
                        const pierce_armor = Number($(e).data('pierce')) || 0;

                        actor.apply_damage(damage, damage_type, critical, pierce_armor);
                        critical = false; // Subsequent hits aren't critical
                    });
                }
            }
        }
    });

    // Edit Test option
    options.push({
        name: 'Edit Results',
        icon: '<i class="fa fa-edit"></i>',
        condition: html => game.user.isGM,
        callback: html => {
            const message_id = html.data('messageId');
            const test = Test.from_json(JSON.parse(html.find('.test-json').val()));

            // Open edit dialog
            new Dialog({
                title: `Edit Results`,
                content: `
                    <form class="saga-machine">
                        <div class="form-group">
                            <label for="critical">Success</label>
                            <input type="checkbox" name="success" ${test.success ? 'checked' : ''}>
                        </div>
                        <div class="form-group">
                            <label for="critical">Critical</label>
                            <input type="checkbox" name="critical" ${test.critical ? 'checked' : ''}>
                        </div>
                        <div class="form-group">
                            <label for="value">Margin</label>
                            <input type="number" name="margin" value="${test.margin}" autofocus>
                        </div>
                        <div class="sheet-body">
                            <ol class="items-list consequence-list">
                                <li class="item flexrow items-header consequence-row">
                                    <div class="item-name">Type</div>
                                    <div class="item-name">Value</div>
                                    <div class="item-controls">
                                        <a class="item-control item-create" title="Create consequence"><i class="fas fa-plus"></i> Add</a>
                                    </div>
                                </li>
                
                                <li class="item flexrow consequence consequence-row prototype">
                                    <select class="item-input item-name" name="type">
                                        <option value="damage">Damage</option>
                                        <option value="consequence">Consequence</option>
                                        <option value="defense">Defense</option>
                                        <option value="message">Message</option>
                                    </select>
                                    <input class="item-input item-name" type="text" name="value" value="" />
                                    <div class="item-controls">
                                        <a class="item-control item-delete" title="Delete Item"><i class="fas fa-trash"></i></a>
                                    </div>
                                </li>
                            </ol>
                        </div>
                    </form>`,
                render: html => {
                    // Fill out existing consequences
                    if (test.consequences && test.consequences.length) {
                        // Get the prototype consequence node and parent node
                        const prototype = html.find('.consequence.prototype');
                        const parent = html.find('ol.consequence-list');

                        // For each consequence, clone the prototype and set up the form
                        for (let consequence of test.consequences) {
                            let value = null;
                            switch (consequence.type) {
                                case 'consequence': value = consequence.name; break;
                                case 'damage': value = `${Number(consequence.value) + (Number(consequence.margin) || Number(test.margin))} ${consequence.damage_type} ${consequence.properties}`; break;
                                case 'message': value = `${consequence.key}: ${consequence.value}`; break;
                                default: value = '';
                            }

                            const clone = prototype.clone();
                            clone.removeClass('prototype');
                            clone.find("[name=type]").val(consequence.type);
                            clone.find("[name=value]").val(value);
                            parent.append(clone);
                        }
                    }

                    html.find('.consequence-list .item-create').click(event => {
                        // Get the prototype consequence node and parent node, return if it wasn't found
                        const prototype = html.find('.consequence.prototype');
                        const parent = html.find('ol.consequence-list');
                        if (!prototype || !prototype.length || !parent || !parent.length) return;

                        const clone = prototype.clone();
                        clone.removeClass('prototype');
                        clone.find('.item-delete').click(event => $(event.currentTarget).closest(".consequence").remove());
                        parent.append(clone);
                    });
                    html.find('.consequence-list .item-delete').click(event => $(event.currentTarget).closest(".consequence").remove());
                },
                buttons: {
                    Edit: {
                        icon: "<i class='fas fa-check'></i>",
                        label: 'OK',
                        callback: async (html) => {
                            // Set values based on the contents of the form
                            test.success = html.find("input[name=success]").is(':checked');
                            test.critical = html.find("input[name=critical]").is(':checked');
                            test.margin = Number(html.find("input[name=margin]").val());
                            test.edited = true;

                            const consequences = [];
                            html.find('.consequence:not(.prototype)').each((i, e) => {
                                const type = $(e).find('select[name=type]').val();
                                const value = $(e).find('input[name=value]').val();

                                const params = {};
                                if      (type === 'consequence') params.name = value.trim();
                                else if (type === 'message') {
                                    const parts = value.split(': ');
                                    if (parts.length >= 2) [params.key, params.value] = [parts[0], parts[1]];
                                    else [params.key, params.value] = ['Message', parts[0]];
                                }
                                else if (type === 'damage') {
                                    const parts = value.split(' ');
                                    params.value = Number(parts?.[0]) - test.margin;
                                    params.damage_type = parts?.[1];
                                    if (parts.length >= 3) params.properties = Attack.parse_properties(parts.slice(2).join(' '));
                                }

                                const consequence = new Consequence({type: type, ...params}, test);
                                consequence.apply(test.success ? 'success' : 'failure')
                                consequences.push(consequence);
                                test.consequences = consequences;
                            });

                            // Save edited card
                            await ChatMessage.updateDocuments([{_id: message_id, content: test.content(), flavor: test.flavor()}], {});
                        }
                    }
                }
            }).render(true);
        }
    });
});
