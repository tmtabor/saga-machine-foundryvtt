/**
 * Capitalize the first letter of the string
 *
 * @param word
 * @returns {string}
 * @private
 */
export function capitalize(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Get the actor from the specified IDs, return null if none found
 *
 * @param scene_id
 * @param token_id
 * @param actor_id
 * @returns {null|*|(function(*))|(function(): (null|null))}
 */
export function token_actor({scene_id=null, token_id=null, actor_id=null}) {
	if (scene_id && token_id) return game.scenes.get(scene_id)?.tokens.get(token_id)?.actor || null;
	else if (actor_id) return game.actors.get(actor_id) || null;
	else return null;
}