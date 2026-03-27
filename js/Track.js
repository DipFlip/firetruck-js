import * as THREE from 'three';

export const ORIENT_DEG = { 0: 0, 10: 180, 16: 90, 22: 270 };
export const TreeTightness = 0.3;

export const CELL = 9.99 * 0.75; // 7.4925
export const CELL_RAW = 9.99;
export const GRID_SCALE = 0.75;

export const TRACK_CELLS = [
	[ -3, -3, 'track-corner',   16 ],
	[ -2, -3, 'track-straight', 22 ],
	[ -1, -3, 'track-straight', 22 ],
	[  0, -3, 'track-corner',    0 ],
	[ -3, -2, 'track-straight',  0 ],
	[  0, -2, 'track-straight',  0 ],
	[ -3, -1, 'track-corner',   10 ],
	[ -2, -1, 'track-corner',    0 ],
	[  0, -1, 'track-straight',  0 ],
	[ -2,  0, 'track-straight', 10 ],
	[  0,  0, 'track-finish',    0 ],
	[ -2,  1, 'track-straight', 10 ],
	[  0,  1, 'track-ramp',      0 ],
	[ -2,  2, 'track-corner',   10 ],
	[ -1,  2, 'track-straight', 16 ],
	[  0,  2, 'track-corner',   22 ],
];

const DECO_CELLS = [
	[ -4, -2, 'decoration-tents', 10 ],
	[ -1, -4, 'decoration-tents', 22 ],
	[ -1,  1, 'decoration-tents', 22 ],
	[ -8, -9, 'decoration-forest', 0 ], [ -7, -9, 'decoration-forest', 0 ],
	[ -6, -9, 'decoration-forest', 0 ], [ -5, -9, 'decoration-forest', 0 ],
	[ -4, -9, 'decoration-forest', 0 ], [ -3, -9, 'decoration-forest', 0 ],
	[ -2, -9, 'decoration-forest', 0 ], [ -1, -9, 'decoration-forest', 0 ],
	[  0, -9, 'decoration-forest', 0 ], [  1, -9, 'decoration-forest', 0 ],
	[  2, -9, 'decoration-forest', 0 ],
	[ -8, -8, 'decoration-forest', 0 ], [ -7, -8, 'decoration-forest', 0 ],
	[ -6, -8, 'decoration-forest', 0 ], [ -5, -8, 'decoration-forest', 0 ],
	[ -4, -8, 'decoration-forest', 0 ], [ -3, -8, 'decoration-forest', 0 ],
	[ -2, -8, 'decoration-forest', 0 ], [ -1, -8, 'decoration-forest', 0 ],
	[  0, -8, 'decoration-forest', 0 ], [  1, -8, 'decoration-forest', 0 ],
	[  2, -8, 'decoration-forest', 0 ],
	[ -8, -7, 'decoration-forest', 0 ], [ -7, -7, 'decoration-forest', 0 ],
	[ -6, -7, 'decoration-forest', 0 ], [ -5, -7, 'decoration-forest', 0 ],
	[ -4, -7, 'decoration-forest', 0 ], [ -3, -7, 'decoration-forest', 0 ],
	[ -2, -7, 'decoration-forest', 0 ], [ -1, -7, 'decoration-forest', 0 ],
	[  0, -7, 'decoration-forest', 0 ], [  1, -7, 'decoration-forest', 0 ],
	[  2, -7, 'decoration-forest', 0 ],
	[ -8, -6, 'decoration-forest', 0 ], [ -7, -6, 'decoration-forest', 0 ],
	[ -6, -6, 'decoration-forest', 0 ], [ -5, -6, 'decoration-forest', 0 ],
	[ -4, -6, 'decoration-forest', 0 ], [ -3, -6, 'decoration-empty', 0 ],
	[ -2, -6, 'decoration-empty', 0 ],  [ -1, -6, 'decoration-empty', 0 ],
	[  0, -6, 'decoration-empty', 0 ],  [  1, -6, 'decoration-forest', 0 ],
	[  2, -6, 'decoration-forest', 0 ],
	[ -8, -5, 'decoration-forest', 0 ], [ -7, -5, 'decoration-forest', 0 ],
	[ -6, -5, 'decoration-forest', 0 ], [ -5, -5, 'decoration-forest', 0 ],
	[ -4, -5, 'decoration-empty', 0 ],  [ -3, -5, 'decoration-empty', 0 ],
	[ -2, -5, 'decoration-empty', 0 ],  [ -1, -5, 'decoration-empty', 0 ],
	[  0, -5, 'decoration-empty', 0 ],  [  1, -5, 'decoration-forest', 0 ],
	[  2, -5, 'decoration-forest', 0 ],
	[ -8, -4, 'decoration-forest', 0 ], [ -7, -4, 'decoration-forest', 0 ],
	[ -6, -4, 'decoration-forest', 0 ], [ -5, -4, 'decoration-forest', 0 ],
	[ -4, -4, 'decoration-empty', 0 ],
	[  1, -4, 'decoration-forest', 0 ],
	[  2, -4, 'decoration-forest', 0 ],
	[ -8, -3, 'decoration-forest', 0 ], [ -7, -3, 'decoration-forest', 0 ],
	[ -6, -3, 'decoration-forest', 0 ], [ -5, -3, 'decoration-forest', 0 ],
	[ -4, -3, 'decoration-empty', 0 ],
	[  1, -3, 'decoration-forest', 0 ],
	[  2, -3, 'decoration-forest', 0 ],
	[ -8, -2, 'decoration-forest', 0 ], [ -7, -2, 'decoration-forest', 0 ],
	[ -6, -2, 'decoration-forest', 0 ], [ -5, -2, 'decoration-forest', 0 ],
	[  1, -2, 'decoration-forest', 0 ],
	[  2, -2, 'decoration-forest', 0 ],
	[ -8, -1, 'decoration-forest', 0 ], [ -7, -1, 'decoration-forest', 0 ],
	[ -6, -1, 'decoration-forest', 0 ], [ -5, -1, 'decoration-forest', 0 ],
	[ -4, -1, 'decoration-empty', 0 ],  [ -1, -1, 'decoration-empty', 0 ],
	[  1, -1, 'decoration-forest', 0 ],
	[  2, -1, 'decoration-forest', 0 ],
	[ -8,  0, 'decoration-forest', 0 ], [ -7,  0, 'decoration-forest', 0 ],
	[ -6,  0, 'decoration-forest', 0 ], [ -5,  0, 'decoration-forest', 0 ],
	[ -4,  0, 'decoration-empty', 0 ],  [ -3,  0, 'decoration-empty', 0 ],
	[ -1,  0, 'decoration-empty', 0 ],
	[  1,  0, 'decoration-forest', 0 ],
	[  2,  0, 'decoration-forest', 0 ],
	[ -8,  1, 'decoration-forest', 0 ], [ -7,  1, 'decoration-forest', 0 ],
	[ -6,  1, 'decoration-forest', 0 ], [ -5,  1, 'decoration-forest', 0 ],
	[ -4,  1, 'decoration-empty', 0 ],  [ -3,  1, 'decoration-empty', 0 ],
	[  1,  1, 'decoration-forest', 0 ],
	[  2,  1, 'decoration-forest', 0 ],
	[ -8,  2, 'decoration-forest', 0 ], [ -7,  2, 'decoration-forest', 0 ],
	[ -6,  2, 'decoration-forest', 0 ], [ -5,  2, 'decoration-forest', 0 ],
	[ -4,  2, 'decoration-empty', 0 ],  [ -3,  2, 'decoration-empty', 0 ],
	[  1,  2, 'decoration-forest', 0 ],
	[  2,  2, 'decoration-forest', 0 ],
	[ -8,  3, 'decoration-forest', 0 ], [ -7,  3, 'decoration-forest', 0 ],
	[ -6,  3, 'decoration-forest', 0 ], [ -5,  3, 'decoration-forest', 0 ],
	[ -4,  3, 'decoration-forest', 0 ], [ -3,  3, 'decoration-forest', 0 ],
	[ -2,  3, 'decoration-forest', 0 ], [ -1,  3, 'decoration-forest', 0 ],
	[  0,  3, 'decoration-forest', 0 ], [  1,  3, 'decoration-forest', 0 ],
	[  2,  3, 'decoration-forest', 0 ],
	[ -8,  4, 'decoration-forest', 0 ], [ -7,  4, 'decoration-forest', 0 ],
	[ -6,  4, 'decoration-forest', 0 ], [ -5,  4, 'decoration-forest', 0 ],
	[ -4,  4, 'decoration-forest', 0 ], [ -3,  4, 'decoration-forest', 0 ],
	[ -2,  4, 'decoration-forest', 0 ], [ -1,  4, 'decoration-forest', 0 ],
	[  0,  4, 'decoration-forest', 0 ], [  1,  4, 'decoration-forest', 0 ],
	[  2,  4, 'decoration-forest', 0 ],
];

const NPC_TRUCKS = [
	[ 'vehicle-truck-green',  -3.51, -0.01,  12.70,  98.0 ],
	[ 'vehicle-truck-purple', -23.78, -0.14, -13.56,   0.0 ],
	[ 'vehicle-truck-red',    -1.36, -0.15, -23.80, 155.9 ],
];

function hashDecorationCell( gx, gz ) {

	let h = gx * 374761393 + gz * 668265263;
	h = ( h ^ ( h >> 13 ) ) * 1274126177;
	return ( h ^ ( h >> 16 ) ) >>> 0;

}

function hashString( value ) {

	let h = 2166136261;

	for ( let i = 0; i < value.length; i ++ ) {

		h ^= value.charCodeAt( i );
		h = Math.imul( h, 16777619 );

	}

	return h >>> 0;

}

function matchesTaggedPrefix( nodeName, prefix ) {

	if ( ! nodeName ) return false;

	const lowerName = nodeName.toLowerCase();
	if ( lowerName.startsWith( prefix ) ) return true;

	const compactPrefix = prefix.endsWith( '.' ) ? prefix.slice( 0, -1 ) : prefix;
	if ( ! lowerName.startsWith( compactPrefix ) ) return false;

	const nextChar = lowerName.charAt( compactPrefix.length );
	return nextChar !== '' && nextChar >= '0' && nextChar <= '9';

}

export function shouldIncludeTreeNode( nodeName, placement, treeTightness = TreeTightness ) {

	if ( ! matchesTaggedPrefix( nodeName, 'tree.' ) ) return true;

	const clampedTightness = THREE.MathUtils.clamp( treeTightness, 0, 1 );
	if ( clampedTightness <= 0 ) return false;
	if ( clampedTightness >= 1 ) return true;

	let h = hashDecorationCell( placement.gx, placement.gz );
	h ^= hashString( placement.key );
	h = Math.imul( h, 16777619 ) >>> 0;
	h ^= hashString( nodeName.toLowerCase() );
	h = Math.imul( h, 16777619 ) >>> 0;

	return h / 4294967296 < clampedTightness;

}

function findTaggedAncestorName( object, prefix ) {

	let current = object;

	while ( current ) {

		if ( matchesTaggedPrefix( current.name, prefix ) ) return current.name;
		current = current.parent;

	}

	return null;

}

function collectTaggedRoots( root, prefix ) {

	const taggedRoots = [];

	root.traverse( ( object ) => {

		if ( ! matchesTaggedPrefix( object.name, prefix ) ) return;
		if ( findTaggedAncestorName( object.parent, prefix ) ) return;
		taggedRoots.push( object );

	} );

	return taggedRoots;

}

export function getDecorationPlacements( customCells ) {

	const placements = [];
	const cells = customCells || TRACK_CELLS;

	if ( ! customCells ) {

		for ( const [ gx, gz, key, orient ] of DECO_CELLS ) {

			placements.push( {
				key,
				gx,
				gz,
				x: ( gx + 0.5 ) * CELL_RAW,
				y: 0.5,
				z: ( gz + 0.5 ) * CELL_RAW,
				rotationY: THREE.MathUtils.degToRad( ORIENT_DEG[ orient ] || 0 ),
			} );

		}

	}

	const occupied = new Set();
	let minX = Infinity, maxX = - Infinity;
	let minZ = Infinity, maxZ = - Infinity;

	for ( const [ gx, gz ] of cells ) {

		occupied.add( gx + ',' + gz );
		minX = Math.min( minX, gx );
		maxX = Math.max( maxX, gx );
		minZ = Math.min( minZ, gz );
		maxZ = Math.max( maxZ, gz );

	}

	if ( ! customCells ) {

		for ( const [ gx, gz ] of DECO_CELLS ) {

			occupied.add( gx + ',' + gz );
			minX = Math.min( minX, gx );
			maxX = Math.max( maxX, gx );
			minZ = Math.min( minZ, gz );
			maxZ = Math.max( maxZ, gz );

		}

	}

	const pad = 3;

	for ( let gz = minZ - pad; gz <= maxZ + pad; gz ++ ) {

		for ( let gx = minX - pad; gx <= maxX + pad; gx ++ ) {

			if ( occupied.has( gx + ',' + gz ) ) continue;

			const distX = gx < minX ? minX - gx : gx > maxX ? gx - maxX : 0;
			const distZ = gz < minZ ? minZ - gz : gz > maxZ ? gz - maxZ : 0;
			const dist = Math.max( distX, distZ );

			const x = ( gx + 0.5 ) * CELL_RAW;
			const z = ( gz + 0.5 ) * CELL_RAW;
			const hash = hashDecorationCell( gx, gz );

			if ( dist <= 1 ) {

				if ( hash % 7 === 0 ) {

					placements.push( {
						key: 'decoration-tents',
						gx,
						gz,
						x,
						y: 0.5,
						z,
						rotationY: ( hash % 4 ) * Math.PI / 2,
					} );

				} else {

					placements.push( {
						key: 'decoration-empty',
						gx,
						gz,
						x,
						y: 0.5,
						z,
						rotationY: 0,
					} );

				}

			} else {

				placements.push( {
					key: 'decoration-forest',
					gx,
					gz,
					x,
					y: 0.5,
					z,
					rotationY: 0,
				} );

			}

		}

	}

	return placements;

}

export function getTrackPiecePlacements( customCells ) {

	const placements = [];
	const cells = customCells || TRACK_CELLS;

	for ( const [ gx, gz, key, orient ] of cells ) {

		if ( key === 'track-ramp' ) {

			placements.push( {
				key: 'track-straight',
				gx,
				gz,
				x: ( gx + 0.5 ) * CELL_RAW,
				y: 0.5,
				z: ( gz + 0.5 ) * CELL_RAW,
				rotationY: THREE.MathUtils.degToRad( ORIENT_DEG[ orient ] || 0 ),
			} );
			placements.push( {
				key: 'ramp',
				gx,
				gz,
				x: ( gx + 0.5 ) * CELL_RAW,
				y: 0.5,
				z: ( gz + 0.5 ) * CELL_RAW,
				rotationY: THREE.MathUtils.degToRad( ORIENT_DEG[ orient ] || 0 ),
			} );
			continue;

		}

		placements.push( {
			key,
			gx,
			gz,
			x: ( gx + 0.5 ) * CELL_RAW,
			y: 0.5,
			z: ( gz + 0.5 ) * CELL_RAW,
			rotationY: THREE.MathUtils.degToRad( ORIENT_DEG[ orient ] || 0 ),
		} );

	}

	return placements;

}

export function buildTrack( scene, models, customCells ) {

	const trackGroup = new THREE.Group();
	trackGroup.position.y = -0.5;

	const trackPieceGroup = new THREE.Group();
	const decoGroup = new THREE.Group();

	for ( const placement of getTrackPiecePlacements( customCells ) ) {

		const piece = models[ placement.key ]?.clone();
		if ( ! piece ) continue;

		for ( const treeRoot of collectTaggedRoots( piece, 'tree.' ) ) {

			if ( shouldIncludeTreeNode( treeRoot.name, placement ) ) continue;
			treeRoot.removeFromParent();

		}
		piece.userData.trackKey = placement.key;
		piece.position.set( placement.x, placement.y, placement.z );
		piece.rotation.y = placement.rotationY;
		trackPieceGroup.add( piece );

	}

	{

		const emptyPlacements = [];
		const forestPlacements = [];
		const tentPlacements = [];
		const decorationPlacements = getDecorationPlacements( customCells );

		for ( const placement of decorationPlacements ) {

			if ( placement.key === 'decoration-empty' ) {

				emptyPlacements.push( placement );

			} else if ( placement.key === 'decoration-forest' ) {

				forestPlacements.push( placement );

			} else if ( placement.key === 'decoration-tents' ) {

				tentPlacements.push( placement );

			}

		}

		const _dummy = new THREE.Object3D();

		function addInstancedMeshesFromSource( src, placements ) {

			if ( placements.length === 0 || ! src ) return;

			src.traverse( ( child ) => {

				if ( ! child.isMesh ) return;

				const inst = new THREE.InstancedMesh( child.geometry, child.material, placements.length );
				inst.name = child.name;
				inst.castShadow = true;
				inst.receiveShadow = true;

				for ( let i = 0; i < placements.length; i ++ ) {

					const placement = placements[ i ];
					_dummy.position.set( placement.x, placement.y, placement.z );
					_dummy.rotation.set( 0, placement.rotationY, 0 );
					_dummy.updateMatrix();
					inst.setMatrixAt( i, _dummy.matrix );

				}

				decoGroup.add( inst );

			} );

		}

		function createInstances( src, placements ) {

			if ( placements.length === 0 || ! src ) return;

			const base = src.clone();
			const treeRoots = collectTaggedRoots( base, 'tree.' );

			for ( const treeRoot of treeRoots ) {

				const filteredPlacements = placements.filter( ( placement ) => shouldIncludeTreeNode( treeRoot.name, placement ) );
				if ( filteredPlacements.length === 0 ) {

					treeRoot.removeFromParent();
					continue;

				}
				addInstancedMeshesFromSource( treeRoot, filteredPlacements );
				treeRoot.removeFromParent();

			}

			addInstancedMeshesFromSource( base, placements );

		}

		createInstances( models[ 'decoration-empty' ], emptyPlacements );
		createInstances( models[ 'decoration-forest' ], forestPlacements );
		createInstances( models[ 'decoration-tents' ], tentPlacements );

	}

	trackGroup.add( trackPieceGroup );
	trackGroup.add( decoGroup );

	trackGroup.scale.setScalar( 0.75 );
	scene.add( trackGroup );

	trackGroup.updateMatrixWorld( true );

	trackGroup.traverse( ( child ) => {

		if ( child.isMesh ) {

			child.castShadow = true;
			child.receiveShadow = true;

		}

	} );

	if ( ! customCells ) {

		for ( const [ key, x, y, z, rotDeg ] of NPC_TRUCKS ) {

			const src = models[ key ];
			if ( ! src ) continue;

			const npc = src.clone();
			npc.position.set( x, y, z );
			npc.rotation.y = THREE.MathUtils.degToRad( rotDeg + 180 );
			npc.traverse( ( c ) => {

				if ( c.isMesh ) {

					c.castShadow = true;
					c.receiveShadow = true;

				}

			} );
			scene.add( npc );

		}

	}

	return trackPieceGroup;

}

export function placePiece( models, key, gx, gz, orient ) {

	const src = models[ key ];
	if ( ! src ) return null;

	const piece = src.clone();
	piece.userData.trackKey = key;
	piece.position.set( ( gx + 0.5 ) * CELL_RAW, 0.5, ( gz + 0.5 ) * CELL_RAW );

	const deg = ORIENT_DEG[ orient ] || 0;
	piece.rotation.y = THREE.MathUtils.degToRad( deg );

	return piece;

}

// ─── Track Codec ──────────────────────────────────────────

const TYPE_NAMES = [ 'track-straight', 'track-corner', 'track-bump', 'track-finish' ];
const TYPE_INDEX = {};
for ( let i = 0; i < TYPE_NAMES.length; i ++ ) TYPE_INDEX[ TYPE_NAMES[ i ] ] = i;

const ORIENT_TO_GODOT = [ 0, 16, 10, 22 ];
const GODOT_TO_ORIENT = { 0: 0, 16: 1, 10: 2, 22: 3 };

export { TYPE_NAMES };

export function encodeCells( cells ) {

	const bytes = new Uint8Array( cells.length * 3 );

	for ( let i = 0; i < cells.length; i ++ ) {

		const [ gx, gz, name, godotOrient ] = cells[ i ];
		const ti = TYPE_INDEX[ name ] ?? 0;
		const oi = GODOT_TO_ORIENT[ godotOrient ] ?? 0;

		bytes[ i * 3 ] = gx + 128;
		bytes[ i * 3 + 1 ] = gz + 128;
		bytes[ i * 3 + 2 ] = ( ti << 2 ) | oi;

	}

	return bytesToBase64url( bytes );

}

export function decodeCells( str ) {

	const bytes = base64urlToBytes( str );
	const cells = [];

	for ( let i = 0; i + 2 < bytes.length; i += 3 ) {

		const gx = bytes[ i ] - 128;
		const gz = bytes[ i + 1 ] - 128;
		const packed = bytes[ i + 2 ];
		const ti = ( packed >> 2 ) & 0x03;
		const oi = packed & 0x03;

		cells.push( [ gx, gz, TYPE_NAMES[ ti ], ORIENT_TO_GODOT[ oi ] ] );

	}

	return cells;

}

export function computeSpawnPosition( cells ) {

	let cell = cells[ 0 ];

	for ( const c of cells ) {

		if ( c[ 2 ] === 'track-finish' ) {

			cell = c;
			break;

		}

	}

	if ( ! cell ) return { position: [ 3.5, 0.5, 5 ], angle: 0 };

	const gx = cell[ 0 ];
	const gz = cell[ 1 ];
	const x = ( gx + 0.5 ) * CELL_RAW * GRID_SCALE;
	const z = ( gz + 0.5 ) * CELL_RAW * GRID_SCALE;

	const orient = cell[ 3 ];
	const angle = THREE.MathUtils.degToRad( ORIENT_DEG[ orient ] || 0 );

	return { position: [ x, 0.5, z ], angle };

}

export function computeTrackBounds( cells ) {

	if ( ! cells || cells.length === 0 ) return { centerX: 0, centerZ: 0, halfWidth: 30, halfDepth: 30 };

	let minX = Infinity, maxX = - Infinity;
	let minZ = Infinity, maxZ = - Infinity;

	for ( const [ gx, gz ] of cells ) {

		minX = Math.min( minX, gx );
		maxX = Math.max( maxX, gx );
		minZ = Math.min( minZ, gz );
		maxZ = Math.max( maxZ, gz );

	}

	const S = CELL_RAW * GRID_SCALE;
	const centerX = ( minX + maxX + 1 ) / 2 * S;
	const centerZ = ( minZ + maxZ + 1 ) / 2 * S;
	const halfWidth = ( maxX - minX + 1 ) / 2 * S + S;
	const halfDepth = ( maxZ - minZ + 1 ) / 2 * S + S;

	return { centerX, centerZ, halfWidth, halfDepth };

}

function bytesToBase64url( bytes ) {

	let binary = '';
	for ( let i = 0; i < bytes.length; i ++ ) binary += String.fromCharCode( bytes[ i ] );

	return btoa( binary ).replace( /\+/g, '-' ).replace( /\//g, '_' ).replace( /=+$/, '' );

}

function base64urlToBytes( str ) {

	const base64 = str.replace( /-/g, '+' ).replace( /_/g, '/' );
	const binary = atob( base64 );
	const bytes = new Uint8Array( binary.length );
	for ( let i = 0; i < binary.length; i ++ ) bytes[ i ] = binary.charCodeAt( i );

	return bytes;

}
