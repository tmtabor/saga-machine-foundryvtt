import { system_setting } from "../system/utils.js";

/**
 * Object representing a set of modifiers for a score or test
 */
export class ModifierSet {
    _name = null;
    _description = null;
    boons = 0;
    banes = 0
    modifier = 0;
    divide = 0;
    percent = 0;
    stress_boons = 0;

    static GRAY = '--tag-bg:#a1a1a1;--tag-text-color:#2b2a2a;--tag-hover:#bababa;--tag-remove-bg:#a1a1a1;--tag-remove-btn-color:#2b2a2a';
    static RED = '--tag-bg:#d19d9d;--tag-text-color:#530d0d;--tag-hover:#e1b4b4;--tag-remove-bg:#d19d9d;--tag-remove-btn-color:#530d0d';
    static GREEN = '--tag-bg:#9dd1ab;--tag-text-color:#224939;--tag-hover:#b5e0c1;--tag-remove-bg:#9dd1ab;--tag-remove-btn-color:#224939';
    static ORANGE = '--tag-bg:#e6d7aa;--tag-text-color:#493c22;--tag-hover:#e0cfb5;--tag-remove-bg:#d1c69d;--tag-remove-btn-color:#493822';

    constructor({name = null, description = null, boons = 0, banes = 0, modifier = 0,
                 divide = 0, percent = 0, stress_boons = 0}) {
        this._name = name;
        this._description = description;
        this.boons = parseInt(boons) || 0;
        this.banes = parseInt(banes) || 0;
        this.modifier = parseInt(modifier) || 0;
        this.divide = parseInt(divide) || 0;
        this.percent = parseInt(percent) || 0;
        this.stress_boons = parseInt(stress_boons) || 0;
    }

    /**
     * Get the name of this modifier
     *
     * @return {string}
     */
    get name() {
        return this._name ? `${this._name} ${this.mod_str()}` : this.mod_str()
    }

    /**
     * Get a description of this modifier
     *
     * @return {string|null}
     */
    get description() {
        return this._description || this._name
    }

    /**
     * Get a string describing the modifier, including boons, banes and value modifier
     *
     * @return {string}
     */
    mod_str() {
        const boons_banes = '⊕'.repeat(this.boons) + '⊖'.repeat(this.banes);
        const mod = this.modifier >= 0 ? `+${this.modifier}` : `${this.modifier}`;
        if (!boons_banes) return mod;
        else if (!this.modifier) return boons_banes;
        else return boons_banes + mod;
    }

    /**
     * Get a Tagify tag representing of this modifier
     *
     * @return {{style: string, title: string|null, value: string}}
     */
    tag() {
        return { value: this.name, title: this.description, style: ModifierSet.color(this.name) }
    }

    /**
     * Return a json representation of this modifier
     * @return {{modifier: number, name: string, description: (string|null), divide: number, percent: number,
     *           boons: number, banes: number, stress_boons: number}}
     */
    json() {
        return {
            "boons": this.boons,
            "banes": this.banes,
            "modifier": this.modifier,
            "divide": this.divide,
            "percent": this.percent,
            "stress_boons": this.stress_boons,
            "name": this.name,
            "description": this.description
        };
    }

    /**
     * Accepts list of raw key/value strings and returns a list of ModifierSet objects
     *
     * Ex: name=short_name&description=for_tooltip&boons=0&banes=0&modifier=0&divide=0&percent=0
     *
     * @param {string[]} raw_mods_list
     * @returns {ModifierSet[]}
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
                    percent: params.get('percent'),
                    stress_boons: params.get('stress_boons')
                }));
            });

            return mods_list;
        } catch (e) {
            console.error(`Error parsing modifiers object: ${raw_mods_list}`);
            return [];
        }
    }

    /**
     * Return a CSS color string for the modifier, based on whether it is positive, negative or neutral
     *
     * @param {string} name
     * @return {string}
     */
    static color(name) {
        const use_stress = system_setting('stress', false);

        const includes_plus = name.includes('+') || name.includes('⊕');
        const includes_minus = name.includes('-') || name.includes('⊖');
        const includes_stress = name.toLowerCase().startsWith('stress');

        if (includes_plus && includes_minus) return ModifierSet.GRAY;
        else if (use_stress && includes_stress && includes_plus) return ModifierSet.ORANGE;
        else if (includes_plus) return ModifierSet.GREEN;
        else if (includes_minus) return ModifierSet.RED;
        else return ModifierSet.GRAY;
    }

    /**
     * Total all modifiers from the given list of modifier sets
     *
     * @param {{modifier: number, divide: number, percent: number, boons: number, banes: number, stress_boons: number, tags: string[]}[]} mods_list
     * @return {{modifier: number, divide: number, percent: number, boons: number, banes: number, stress_boons: number, tags: string[]}}
     */
    static total_modifiers(mods_list) {
        let boons = 0;
        let banes = 0;
        let modifier = 0;
        let divide = 1;
        let percent = 0;
        let stress_boons = 0;
        let tags = [];

        // Add up the totals
        mods_list.forEach(m => {
            boons += m.boons || 0;
            banes += m.banes || 0;
            modifier += m.modifier || 0;
            divide *= m.divide || 0;
            percent += m.percent || 0;
            stress_boons += m.stress_boons || 0;
            if (!!m.name) tags.push(m.name);
        });

        return { boons: boons, banes: banes, modifier: modifier, divide: divide, percent: percent, stress_boons: stress_boons, tags: tags };
    }

    /**
     * Parse a string containing a list of Tagify tags and return a list of ModifierSet objects
     *
     * @param {string} input_str
     * @return {ModifierSet[]}
     */
    static list_from_string(input_str) {
        let json_list = null;
        try {
            if (input_str) json_list = JSON.parse(input_str);
        } catch (e) {
            console.error("Error parsing list from tagify");
        }

        if (!json_list) return [];
        if (!Array.isArray(json_list)) json_list = [json_list];

        return json_list.map(t => ModifierSet.from_tag(t));
    }

    /**
     * Parse a json object or string representing a single Tagify tag and return a ModifierSet object.
     *
     * Accepts JSON in the format:
     *     [{"value":"Dazed ⊖","title":"Dazed","color":"red"},{"value":"Confused ⊕"},{"value":"Skilled +2"}]
     * Or a string in the format:
     *     "Dazed ⊖"
     *
     * @param {{value: string, title: string|undefined, color: string|undefined}|string} tag
     * @return {ModifierSet}
     */
    static from_tag(tag) {
        const value = (typeof tag === 'string' || tag instanceof String) ? tag : tag.value;
        if (!value) return {};

        // Parse the tag name
        const spaced = value.replace(/([a-zA-Z0-9])([+-])/g, '$1 $2');
        const parts = spaced.split(" ");
        const all_mods = parts.pop();
        const name = parts.join(" ");

        // Count boons, banes and mod
        let modifier = parseInt(all_mods.replace(/^\D+/, '')) || null;
        let leading = all_mods.replace(/[0-9]/g, '');
        if (modifier !== null && leading.at(-1) === '-') modifier *= -1; // If mod is negative, make it so
        if (modifier !== null) leading = leading.slice(0, -1);
        let boons = (leading.match(/[+⊕]/g) || []).length;
        let banes = (leading.match(/[-⊖]/g) || []).length;
        let stress_boons = name.toLowerCase().startsWith('stress') && (leading.match(/[+⊕]/g) || []).length;

        return new ModifierSet({
            name: name.replace(/[⊕⊖]/g, ''),
            boons: boons,
            banes: banes,
            modifier: modifier || 0,
            stress_boons: stress_boons
        });
    }
}