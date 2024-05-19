/**
 * Capitalize the first letter of the string
 *
 * @param {string} word
 * @returns {string}
 * @private
 */
export function capitalize(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Get the actor from the specified IDs, return null if none found
 *
 * @param {string} scene_id
 * @param {string} token_id
 * @param {string} actor_id
 * @returns {SagaMachineActor|null}
 */
export function token_actor({scene_id=null, token_id=null, actor_id=null}) {
	if (scene_id && token_id) return game.scenes.get(scene_id)?.tokens.get(token_id)?.actor || null;
	else if (actor_id) return game.actors.get(actor_id) || null;
	else return null;
}

/**
 * Returns the median value from an array of numbers
 *
 * @param {number[]} arr
 * @returns {number}
 */
export function median(arr) {
	const mid = Math.floor(arr.length / 2), nums = [...arr].sort((a, b) => a - b);
	return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/**
 * Returns a random member of the provided list
 *
 * @param {*[]} member_list
 * @returns {*}
 */
export function random_member(member_list) {
	return member_list[Math.floor(Math.random() * member_list.length)];
}