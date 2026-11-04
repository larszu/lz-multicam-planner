// Die MCP-Werkzeuge des Planers (#218), benannt nach dem Arbeitsschritt am
// Set. Ausgefuehrt werden sie im Renderer (src/mcp/werkzeuge.ts) gegen den
// Store; hier stehen nur Name, Beschreibung und Eingabeform.
const { z } = require('zod');

const id = (what) => z.string().describe(`${what} id (or label)`);
const FRAMINGS = ['wide', 'full', 'medium', 'close', 'detail', 'footprint'];

const TOOL_SPECS = [
  { name: 'scene_outline', write: false, description: 'The scene as an indented outline: venue, stages, cameras (body, lens, focal length, f-stop, position), people and objects (pose, height, position). Use get_node for details.', shape: {} },
  { name: 'get_node', write: false, description: 'All details of one camera, person/object, stage or wall, including field of view, frame mask, optical converter and control route of a camera.', shape: { id: id('Node') } },
  { name: 'list_catalog', write: false, description: 'Search camera bodies, lenses or optical converters to get ids for place_camera and set_lens.', shape: { kind: z.enum(['cameras', 'lenses', 'converters']).optional(), query: z.string().optional(), limit: z.number().int().min(1).max(50).optional() } },
  { name: 'place_camera', write: true, description: 'Set up a new camera position. Plan coordinates in metres from the top-left corner; z is lens height.', shape: { x: z.number(), y: z.number(), z: z.number().optional(), label: z.string().optional(), cameraModelId: z.string().optional(), lensId: z.string().optional() } },
  { name: 'move_camera', write: true, description: 'Move or turn a camera: position in metres, pan/tilt in degrees (pan 0 = +x, 90 = +y; tilt negative = down).', shape: { cameraId: id('Camera'), x: z.number().optional(), y: z.number().optional(), z: z.number().optional(), pan: z.number().optional(), tilt: z.number().optional() } },
  { name: 'set_lens', write: true, description: 'Change lens, focal length (mm, without extender), f-stop or focus distance (m).', shape: { cameraId: id('Camera'), lensId: z.string().optional(), focalLength: z.number().optional(), aperture: z.number().optional(), focusDistance: z.number().optional() } },
  { name: 'aim_at', write: true, description: 'Point a camera at a person/object (targetId, eye height unless z is given) or at a point (x, y, z). Sets pan, tilt and focus distance.', shape: { cameraId: id('Camera'), targetId: z.string().optional(), x: z.number().optional(), y: z.number().optional(), z: z.number().optional() } },
  { name: 'frame_shot', write: true, description: 'Frame a shot size on a person/object: aims the camera and sets the focal length (and extender) the lens needs; reports when the lens cannot reach it.', shape: { cameraId: id('Camera'), targetId: z.string(), framing: z.enum(FRAMINGS) } },
  { name: 'render_preview', write: false, description: 'Render the camera view of one camera as PNG.', shape: { cameraId: id('Camera'), width: z.number().int().min(160).max(1920).optional() } },
  { name: 'render_top_view', write: false, description: 'Render the floor plan (top view) as PNG.', shape: {} },
  { name: 'undo', write: true, description: 'Undo the last change (one tool call is one step).', shape: {} },
  { name: 'redo', write: true, description: 'Redo the last undone change.', shape: {} },
];

const ALIASES = { look_at: 'aim_at', get_scene: 'scene_outline' };

module.exports = { TOOL_SPECS, ALIASES };
