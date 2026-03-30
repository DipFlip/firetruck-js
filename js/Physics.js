import * as THREE from 'three';
import { rigidBody, box, sphere, capsule, convexHull, transformed, offsetCenterOfMass, pointConstraint, ConstraintSpace, MotionType, MotionQuality, dof } from 'crashcat';
import { TRACK_CELLS, CELL_RAW, ORIENT_DEG, GRID_SCALE, getDecorationPlacements, getTrackPiecePlacements, shouldIncludeTreeNode } from './Track.js';

const _debugMat = new THREE.MeshBasicMaterial( { color: 0x00ff00, wireframe: true } );
const VEHICLE_SPHERE_RADIUS = 0.5;
const VEHICLE_COLLISION_ALIGNMENT = new THREE.Quaternion().setFromEuler( new THREE.Euler( Math.PI / 2, 0, 0 ) );
const VEHICLE_COLLISION_ALIGNMENT_INV = new THREE.Quaternion().setFromEuler( new THREE.Euler( - Math.PI / 2, 0, 0 ) );
const _tmpVec3A = new THREE.Vector3();
const _tmpVec3B = new THREE.Vector3();
const _tmpVec3C = new THREE.Vector3();
const _tmpQuatA = new THREE.Quaternion();
const _tmpVec2A = new THREE.Vector2();
const _tmpVec2B = new THREE.Vector2();
const _probeCenter2D = new THREE.Vector2();
const _probeAxisGroundZ = new THREE.Vector2();
const WALL_PROBE_BOUNCE = 0.2;
const BUMPER_CLEARANCE_RATIO = 0.38;
const BUMPER_HEIGHT_RATIO = 0.3;
const MIN_BUMPER_HALF_HEIGHT = 0.18;
const MIN_BUMPER_BOTTOM = VEHICLE_SPHERE_RADIUS * 0.9;
const CAPSULE_SAMPLE_OFFSETS = [ - 1, - 0.5, 0, 0.5, 1 ];
const SPHERE_SAMPLE_OFFSETS = [ 0 ];
const DECORATION_COLLIDER_RADIUS_CELLS = 2;
let _rampShape = null;
const _convexHullDebugGeometries = new WeakMap();

function addDebugBox( group, halfExtents, position, quaternion ) {

	const geo = new THREE.BoxGeometry( halfExtents[ 0 ] * 2, halfExtents[ 1 ] * 2, halfExtents[ 2 ] * 2 );
	const mesh = new THREE.Mesh( geo, _debugMat );
	mesh.position.set( position[ 0 ], position[ 1 ], position[ 2 ] );
	if ( quaternion ) mesh.quaternion.set( quaternion[ 0 ], quaternion[ 1 ], quaternion[ 2 ], quaternion[ 3 ] );
	group.add( mesh );

}

export function buildWallColliders( world, debugGroup, customCells, collisionGroups, collisionMask ) {

	const S = GRID_SCALE;
	const CELL_HALF = CELL_RAW / 2;

	const WALL_HALF_THICK = 0.25;
	const WALL_X = 4.75;
	const WALL_HALF_H = 0.5625;

	const wallY = ( 0.5 + WALL_HALF_H ) * S - 0.5;
	const hThick = WALL_HALF_THICK * S;
	const hHeight = WALL_HALF_H * S;
	const hLen = CELL_HALF * S;

	const ARC_SPAN = - Math.PI / 2;
	const ARC_CENTER_X = - CELL_HALF;
	const ARC_CENTER_Z = CELL_HALF;
	const OUTER_R = 2 * CELL_HALF - WALL_HALF_THICK;
	const OUTER_SEG = 8;
	const OUTER_SEG_HALF_LEN = ( OUTER_R * ( Math.PI / 2 ) / OUTER_SEG / 2 ) * S;
	const INNER_R = WALL_HALF_THICK;
	const INNER_SEG = 3;
	const INNER_SEG_HALF_LEN = ( INNER_R * ( Math.PI / 2 ) / INNER_SEG / 2 ) * S;
	const wallProbeBoxes = [];

	function addArcWall( wcx, wcz, arcStart, radius, numSeg, segHalfLen ) {

		for ( let i = 0; i < numSeg; i ++ ) {

			const aMid = arcStart + ( ( i + 0.5 ) / numSeg ) * ARC_SPAN;
			const halfExtents = [ hThick, hHeight, segHalfLen ];
			const position = [
				wcx + radius * Math.cos( aMid ) * S,
				wallY,
				wcz + radius * Math.sin( aMid ) * S
			];
			const quaternion = [ 0, Math.sin( - aMid / 2 ), 0, Math.cos( - aMid / 2 ) ];

			rigidBody.create( world, {
				shape: box.create( { halfExtents } ),
				motionType: MotionType.STATIC,
				objectLayer: world._OL_STATIC,
				position,
				quaternion,
				friction: 0.0,
				restitution: 0.1,
				collisionGroups,
				collisionMask,
			} );

			wallProbeBoxes.push( {
				kind: 'corner',
				centerX: position[ 0 ],
				centerY: position[ 1 ],
				centerZ: position[ 2 ],
				halfX: halfExtents[ 0 ],
				halfY: halfExtents[ 1 ],
				halfZ: halfExtents[ 2 ],
				angle: - aMid,
			} );

			if ( debugGroup ) addDebugBox( debugGroup, halfExtents, position, quaternion );

		}

	}

	const cells = customCells || TRACK_CELLS;

	for ( const [ gx, gz, key, orient ] of cells ) {

		if ( key === 'track-bump' ) continue;

		const cx = ( gx + 0.5 ) * CELL_RAW * S;
		const cz = ( gz + 0.5 ) * CELL_RAW * S;

		const deg = ORIENT_DEG[ orient ] ?? 0;
		const rad = deg * Math.PI / 180;
		const cr = Math.cos( rad ), sr = Math.sin( rad );

		if ( key === 'track-straight' || key === 'track-finish' || key === 'track-ramp' ) {

			for ( const side of [ - 1, 1 ] ) {

				const lx = side * WALL_X;
				const wx = cx + ( lx * cr ) * S;
				const wz = cz + ( - lx * sr ) * S;
				const halfExtents = [ hThick, hHeight, hLen ];
				const position = [ wx, wallY, wz ];
				const quaternion = [ 0, Math.sin( rad / 2 ), 0, Math.cos( rad / 2 ) ];

				rigidBody.create( world, {
					shape: box.create( { halfExtents } ),
					motionType: MotionType.STATIC,
					objectLayer: world._OL_STATIC,
					position,
					quaternion,
					friction: 0.0,
					restitution: 0.1,
					collisionGroups,
					collisionMask,
				} );

					wallProbeBoxes.push( {
						kind: 'straight',
						centerX: position[ 0 ],
						centerY: position[ 1 ],
						centerZ: position[ 2 ],
						halfX: halfExtents[ 0 ],
						halfY: halfExtents[ 1 ],
						halfZ: halfExtents[ 2 ],
						angle: rad,
					} );

				if ( debugGroup ) addDebugBox( debugGroup, halfExtents, position, quaternion );

			}

		} else if ( key === 'track-corner' ) {

			const wcx = cx + ( ARC_CENTER_X * cr + ARC_CENTER_Z * sr ) * S;
			const wcz = cz + ( - ARC_CENTER_X * sr + ARC_CENTER_Z * cr ) * S;
			const arcStart = - rad;

			addArcWall( wcx, wcz, arcStart, OUTER_R, OUTER_SEG, OUTER_SEG_HALF_LEN );
			addArcWall( wcx, wcz, arcStart, INNER_R, INNER_SEG, INNER_SEG_HALF_LEN );

		}

	}

	return wallProbeBoxes;

}

function collectNodeVerticesInRootSpace( root, node, measurementScale = GRID_SCALE ) {

	root.updateMatrixWorld( true );
	const toRootSpace = new THREE.Matrix4().copy( root.matrixWorld ).invert();
	const positions = [];

	node.traverse( ( child ) => {

		if ( ! child.isMesh || ! child.geometry ) return;

		const positionAttr = child.geometry.getAttribute( 'position' );
		if ( ! positionAttr ) return;

		const toLocal = new THREE.Matrix4().multiplyMatrices( toRootSpace, child.matrixWorld );

		for ( let i = 0; i < positionAttr.count; i ++ ) {

			_tmpVec3A.fromBufferAttribute( positionAttr, i ).applyMatrix4( toLocal );
			positions.push(
				_tmpVec3A.x * measurementScale,
				_tmpVec3A.y * measurementScale,
				_tmpVec3A.z * measurementScale
			);

		}

	} );

	return positions;

}

function buildNodeDebugGeometryInRootSpace( root, node, measurementScale = GRID_SCALE ) {

	root.updateMatrixWorld( true );
	const toRootSpace = new THREE.Matrix4().copy( root.matrixWorld ).invert();
	const positions = [];

	node.traverse( ( child ) => {

		if ( ! child.isMesh || ! child.geometry ) return;

		const positionAttr = child.geometry.getAttribute( 'position' );
		if ( ! positionAttr ) return;

		const index = child.geometry.getIndex();
		const toLocal = new THREE.Matrix4().multiplyMatrices( toRootSpace, child.matrixWorld );

		function pushVertex( vertexIndex ) {

			_tmpVec3A.fromBufferAttribute( positionAttr, vertexIndex ).applyMatrix4( toLocal );
			positions.push(
				_tmpVec3A.x * measurementScale,
				_tmpVec3A.y * measurementScale,
				_tmpVec3A.z * measurementScale
			);

		}

		if ( index ) {

			for ( let i = 0; i < index.count; i ++ ) pushVertex( index.array[ i ] );

		} else {

			for ( let i = 0; i < positionAttr.count; i ++ ) pushVertex( i );

		}

	} );

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	return geometry;

}

function getRampShape( rampModel ) {

	if ( _rampShape ) return _rampShape;
	if ( ! rampModel ) return null;

	const colliderNode = findNamedNode( rampModel, ( name ) => name.includes( 'collider' ) );
	const shapeSource = colliderNode || rampModel;
	const positions = collectNodeVerticesInRootSpace( rampModel, shapeSource );

	if ( positions.length < 12 ) return null;

	_rampShape = convexHull.create( { positions } );
	return _rampShape;

}

function getConvexHullDebugGeometry( shape ) {

	const cached = _convexHullDebugGeometries.get( shape );
	if ( cached ) return cached;

	const positions = [];

	for ( const face of shape.faces ) {

		if ( face.numVertices < 3 ) continue;

		const firstPoint = shape.points[ shape.vertexIndices[ face.firstVertex ] ].position;

		for ( let i = 1; i < face.numVertices - 1; i ++ ) {

			const pointB = shape.points[ shape.vertexIndices[ face.firstVertex + i ] ].position;
			const pointC = shape.points[ shape.vertexIndices[ face.firstVertex + i + 1 ] ].position;
			positions.push(
				firstPoint[ 0 ], firstPoint[ 1 ], firstPoint[ 2 ],
				pointB[ 0 ], pointB[ 1 ], pointB[ 2 ],
				pointC[ 0 ], pointC[ 1 ], pointC[ 2 ]
			);

		}

	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	_convexHullDebugGeometries.set( shape, geometry );
	return geometry;

}

function addDebugConvexHull( group, shape, position, quaternion ) {

	const mesh = new THREE.Mesh( getConvexHullDebugGeometry( shape ), _debugMat );
	mesh.position.set( position[ 0 ], position[ 1 ], position[ 2 ] );
	mesh.quaternion.set( quaternion[ 0 ], quaternion[ 1 ], quaternion[ 2 ], quaternion[ 3 ] );
	group.add( mesh );

}

function getRampShapeWorldPosition( shape, baseX, baseY, baseZ, rad ) {

	_tmpQuatA.setFromAxisAngle( THREE.Object3D.DEFAULT_UP, rad );
	_tmpVec3A.fromArray( shape.centerOfMass ).applyQuaternion( _tmpQuatA );
	return _tmpVec3B.set(
		baseX + _tmpVec3A.x,
		baseY + _tmpVec3A.y,
		baseZ + _tmpVec3A.z
	);

}

export function buildRampColliders( world, customCells, rampModel, collisionGroups, collisionMask, debugGroup = null ) {

	const cells = customCells || TRACK_CELLS;
	const rampY = 0.5 * GRID_SCALE - 0.5;
	const shape = getRampShape( rampModel );
	if ( ! shape ) return;

	for ( const [ gx, gz, key, orient ] of cells ) {

		if ( key !== 'track-ramp' ) continue;

		const deg = ORIENT_DEG[ orient ] ?? 0;
		const rad = deg * Math.PI / 180;
		const baseX = ( gx + 0.5 ) * CELL_RAW * GRID_SCALE;
		const baseZ = ( gz + 0.5 ) * CELL_RAW * GRID_SCALE;
		const rampPosition = getRampShapeWorldPosition( shape, baseX, rampY, baseZ, rad );
		rigidBody.create( world, {
			shape,
			motionType: MotionType.STATIC,
			objectLayer: world._OL_STATIC,
			position: [
				rampPosition.x,
				rampPosition.y,
				rampPosition.z
			],
			quaternion: [ 0, Math.sin( rad / 2 ), 0, Math.cos( rad / 2 ) ],
			friction: 5.0,
			restitution: 0.0,
			collisionGroups,
			collisionMask,
		} );

		if ( debugGroup ) {

			addDebugConvexHull( debugGroup, shape, [
				rampPosition.x,
				rampPosition.y,
				rampPosition.z
			], [ 0, Math.sin( rad / 2 ), 0, Math.cos( rad / 2 ) ] );

		}

	}

}

function findNamedNodes( root, matcher ) {

	const matches = [];

	root.traverse( ( child ) => {

		if ( child.name && matcher( child.name.toLowerCase(), child ) ) matches.push( child );

	} );

	return matches;

}

function getNamedObstacleColliderProfiles( model ) {

	if ( ! model ) return [];

	const colliderNodes = findNamedNodes( model, ( name ) => name.startsWith( 'tree' ) || name.startsWith( 'bump' ) );
	const profiles = [];

	for ( const node of colliderNodes ) {

		const positions = collectNodeVerticesInRootSpace( model, node );
		if ( positions.length < 12 ) continue;

		const shape = convexHull.create( { positions } );
		profiles.push( {
			name: node.name,
			shape,
		} );

	}

	return profiles;

}

function getConvexShapeWorldPosition( shape, baseX, baseY, baseZ, rad ) {

	_tmpQuatA.setFromAxisAngle( THREE.Object3D.DEFAULT_UP, rad );
	_tmpVec3A.fromArray( shape.centerOfMass ).applyQuaternion( _tmpQuatA );
	return _tmpVec3B.set(
		baseX + _tmpVec3A.x,
		baseY + _tmpVec3A.y,
		baseZ + _tmpVec3A.z
	);

}

function createStaticPlacementColliders( world, placements, models, collisionGroups, collisionMask, debugGroup = null ) {

	if ( !models || !placements?.length ) return;
	const profileCache = new Map();

	for ( const placement of placements ) {

		let profiles = profileCache.get( placement.key );
		if ( profiles === undefined ) {

			profiles = getNamedObstacleColliderProfiles( models[ placement.key ] );
			profileCache.set( placement.key, profiles );

		}

		if ( profiles.length === 0 ) continue;

		const rad = placement.rotationY;
		const quaternion = [ 0, Math.sin( rad / 2 ), 0, Math.cos( rad / 2 ) ];
		const baseX = placement.x * GRID_SCALE;
		const baseY = placement.y * GRID_SCALE - 0.5;
		const baseZ = placement.z * GRID_SCALE;

		for ( const profile of profiles ) {

			if ( ! shouldIncludeTreeNode( profile.name, placement ) ) continue;
			const position = getConvexShapeWorldPosition( profile.shape, baseX, baseY, baseZ, rad );

			rigidBody.create( world, {
				shape: profile.shape,
				motionType: MotionType.STATIC,
				objectLayer: world._OL_STATIC,
				position: [ position.x, position.y, position.z ],
				quaternion,
				friction: 0.0,
				restitution: 0.1,
				collisionGroups,
				collisionMask,
			} );

			if ( debugGroup ) addDebugConvexHull( debugGroup, profile.shape, [ position.x, position.y, position.z ], quaternion );

		}

	}

}

export function buildTrackObstacleColliders( world, models, customCells, collisionGroups, collisionMask, debugGroup = null ) {

	createStaticPlacementColliders(
		world,
		getTrackPiecePlacements( customCells ),
		models,
		collisionGroups,
		collisionMask,
		debugGroup
	);

}

export function createDecorationColliderSystem( world, models, customCells, collisionGroups, collisionMask, debugGroup = null ) {

	if ( ! models ) return null;

	const placements = getDecorationPlacements( customCells );
	if ( placements.length === 0 ) return null;

	const profileCache = new Map();

	for ( const placement of placements ) {

		if ( profileCache.has( placement.key ) ) continue;
		const profiles = getNamedObstacleColliderProfiles( models[ placement.key ] );
		if ( profiles.length > 0 ) profileCache.set( placement.key, profiles );

	}

	if ( profileCache.size === 0 ) return null;

	const activeBodiesByIndex = new Map();
	const debugDecorationGroup = debugGroup ? new THREE.Group() : null;
	if ( debugDecorationGroup ) debugGroup.add( debugDecorationGroup );
	let lastCenterGX = null;
	let lastCenterGZ = null;

	function activatePlacement( index ) {

		if ( activeBodiesByIndex.has( index ) ) return;

		const placement = placements[ index ];
		const profiles = profileCache.get( placement.key );
		if ( ! profiles || profiles.length === 0 ) return;

		const rad = placement.rotationY;
		const quaternion = [ 0, Math.sin( rad / 2 ), 0, Math.cos( rad / 2 ) ];
		const baseX = placement.x * GRID_SCALE;
		const baseY = placement.y * GRID_SCALE - 0.5;
		const baseZ = placement.z * GRID_SCALE;
		const bodyIds = [];
		const debugMeshes = [];

		for ( const profile of profiles ) {

			if ( ! shouldIncludeTreeNode( profile.name, placement ) ) continue;
			const position = getConvexShapeWorldPosition( profile.shape, baseX, baseY, baseZ, rad );
			const body = rigidBody.create( world, {
				shape: profile.shape,
				motionType: MotionType.STATIC,
				objectLayer: world._OL_STATIC,
				position: [ position.x, position.y, position.z ],
				quaternion,
				friction: 0.0,
				restitution: 0.1,
				collisionGroups,
				collisionMask,
			} );
			bodyIds.push( body.id );

			if ( debugDecorationGroup ) {

				const mesh = new THREE.Mesh( getConvexHullDebugGeometry( profile.shape ), _debugMat );
				mesh.position.set( position.x, position.y, position.z );
				mesh.quaternion.set( quaternion[ 0 ], quaternion[ 1 ], quaternion[ 2 ], quaternion[ 3 ] );
				debugDecorationGroup.add( mesh );
				debugMeshes.push( mesh );

			}

		}

		activeBodiesByIndex.set( index, { bodyIds, debugMeshes } );

	}

	function deactivatePlacement( index ) {

		const activeEntry = activeBodiesByIndex.get( index );
		if ( ! activeEntry ) return;

		for ( const bodyId of activeEntry.bodyIds ) {

			const body = rigidBody.get( world, bodyId );
			if ( body ) rigidBody.remove( world, body );

		}

		for ( const mesh of activeEntry.debugMeshes ) mesh.removeFromParent();

		activeBodiesByIndex.delete( index );

	}

	function update( worldX, worldZ ) {

		const centerGX = Math.floor( worldX / ( CELL_RAW * GRID_SCALE ) );
		const centerGZ = Math.floor( worldZ / ( CELL_RAW * GRID_SCALE ) );

		if ( centerGX === lastCenterGX && centerGZ === lastCenterGZ ) return;

		lastCenterGX = centerGX;
		lastCenterGZ = centerGZ;

		const desiredIndices = new Set();

		for ( let i = 0; i < placements.length; i ++ ) {

			const placement = placements[ i ];
			if ( ! profileCache.has( placement.key ) ) continue;
			if ( Math.abs( placement.gx - centerGX ) > DECORATION_COLLIDER_RADIUS_CELLS ) continue;
			if ( Math.abs( placement.gz - centerGZ ) > DECORATION_COLLIDER_RADIUS_CELLS ) continue;
			desiredIndices.add( i );

		}

		for ( const index of [ ...activeBodiesByIndex.keys() ] ) {

			if ( ! desiredIndices.has( index ) ) deactivatePlacement( index );

		}

		for ( const index of desiredIndices ) activatePlacement( index );

	}

	function dispose() {

		for ( const index of [ ...activeBodiesByIndex.keys() ] ) deactivatePlacement( index );
		if ( debugDecorationGroup ) debugDecorationGroup.removeFromParent();

	}

	return { update, dispose };

}

export function createVehicleCollisionProfile( model ) {

	const colliderNode = findNamedNode( model, ( name ) => name.includes( 'collider' ) );
	const sphereAnchorNode = findNamedNode( model, ( name ) => name === 'sphereanchor' || name === 'driveball' || name === 'ballanchor' );
	const profileSource = colliderNode || findNamedNode( model, ( name ) => name === 'body' ) || model;
	const measurementScale = getRootUniformScale( model );
	const bounds = computeNodeBoundsInRootSpace( model, profileSource, measurementScale );
	const sphereAnchor = sphereAnchorNode ? computeNodeOriginInRootSpace( model, sphereAnchorNode, measurementScale ).clone() : new THREE.Vector3( 0, VEHICLE_SPHERE_RADIUS, 0 );

	if ( ! bounds || bounds.isEmpty() ) {

		return {
			offsetX: 0,
			offsetY: 0.9,
			offsetZ: 0,
			bodyOffsetX: 0,
			bodyOffsetY: 0.9,
			bodyOffsetZ: 0,
			radius: 0.45,
			halfHeightOfCylinder: 0.9,
			alignment: VEHICLE_COLLISION_ALIGNMENT.clone(),
			alignmentInverse: VEHICLE_COLLISION_ALIGNMENT_INV.clone(),
			sphereAnchorX: sphereAnchor.x,
			sphereAnchorY: sphereAnchor.y,
			sphereAnchorZ: sphereAnchor.z,
			debugGeometry: new THREE.CapsuleGeometry( 0.45, 1.8, 4, 8 ),
			shape: capsule.create( {
				radius: 0.45,
				halfHeightOfCylinder: 0.9,
			} ),
		};

	}

	bounds.getCenter( _tmpVec3A );
	bounds.getSize( _tmpVec3B );

	const radius = Math.max( Math.min( _tmpVec3B.x, _tmpVec3B.y ) * 0.45, 0.25 );
	const halfLength = Math.max( _tmpVec3B.z * 0.5, radius );
	const hullPositions = colliderNode ? collectNodeVerticesInRootSpace( model, colliderNode, measurementScale ) : [];

	if ( hullPositions.length >= 12 ) {

		const rawShape = convexHull.create( {
			positions: hullPositions,
			convexRadius: 0,
		} );
		const shape = offsetCenterOfMass.create( {
			shape: transformed.create( {
				shape: rawShape,
				position: [ rawShape.centerOfMass[ 0 ], rawShape.centerOfMass[ 1 ], rawShape.centerOfMass[ 2 ] ],
				quaternion: [ 0, 0, 0, 1 ],
			} ),
			offset: [ - rawShape.centerOfMass[ 0 ], - rawShape.centerOfMass[ 1 ], - rawShape.centerOfMass[ 2 ] ],
		} );

		return {
			offsetX: shape.centerOfMass[ 0 ],
			offsetY: shape.centerOfMass[ 1 ],
			offsetZ: shape.centerOfMass[ 2 ],
			bodyOffsetX: 0,
			bodyOffsetY: 0,
			bodyOffsetZ: 0,
			radius,
			halfHeightOfCylinder: Math.max( halfLength - radius, 0 ),
			alignment: new THREE.Quaternion(),
			alignmentInverse: new THREE.Quaternion(),
			sphereAnchorX: sphereAnchor.x,
			sphereAnchorY: sphereAnchor.y,
			sphereAnchorZ: sphereAnchor.z,
			debugGeometry: buildNodeDebugGeometryInRootSpace( model, colliderNode, measurementScale ),
			shape,
		};

	}

	return {
		offsetX: _tmpVec3A.x,
		offsetY: _tmpVec3A.y,
		offsetZ: _tmpVec3A.z,
		bodyOffsetX: _tmpVec3A.x,
		bodyOffsetY: _tmpVec3A.y,
		bodyOffsetZ: _tmpVec3A.z,
		radius,
		halfHeightOfCylinder: Math.max( halfLength - radius, 0 ),
		alignment: VEHICLE_COLLISION_ALIGNMENT.clone(),
		alignmentInverse: VEHICLE_COLLISION_ALIGNMENT_INV.clone(),
		sphereAnchorX: sphereAnchor.x,
		sphereAnchorY: sphereAnchor.y,
		sphereAnchorZ: sphereAnchor.z,
		debugGeometry: new THREE.CapsuleGeometry(
			radius,
			Math.max( halfLength - radius, 0 ) * 2,
			4,
			8
		),
		shape: capsule.create( {
			radius,
			halfHeightOfCylinder: Math.max( halfLength - radius, 0 ),
		} ),
	};

}

export function createVehicleCollisionBody( world, collisionProfile, position, quaternion, collisionGroups, collisionMask ) {

	return rigidBody.create( world, {
		shape: collisionProfile.shape,
		motionType: MotionType.DYNAMIC,
		objectLayer: world._OL_MOVING,
		position,
		quaternion,
		mass: 150.0,
		friction: 0.0,
		restitution: 0.1,
		gravityFactor: 0.0,
		angularDamping: 1.5,
		motionQuality: MotionQuality.LINEAR_CAST,
		allowedDegreesOfFreedom: dof( true, true, true, true, true, true ),
		collisionGroups,
		collisionMask,
	} );

}

export function createVehicleCollisionConstraint( world, sphereBody, collisionBody, collisionProfile ) {

	const collisionAnchor = _tmpVec3C.set(
		collisionProfile.sphereAnchorX - collisionProfile.offsetX,
		collisionProfile.sphereAnchorY - collisionProfile.offsetY,
		collisionProfile.sphereAnchorZ - collisionProfile.offsetZ
	).applyQuaternion( collisionProfile.alignmentInverse );

	return pointConstraint.create( world, {
		bodyIdA: sphereBody.id,
		bodyIdB: collisionBody.id,
		pointA: [ 0, 0, 0 ],
		pointB: [
			collisionAnchor.x,
			collisionAnchor.y,
			collisionAnchor.z,
		],
		space: ConstraintSpace.LOCAL,
	} );

}

function findNamedNode( root, matcher ) {

	let matchedNode = null;

	root.traverse( ( child ) => {

		if ( matchedNode ) return;
		if ( child.name && matcher( child.name.toLowerCase() ) ) matchedNode = child;

	} );

	return matchedNode;

}

function getRootUniformScale( root ) {

	root.updateMatrixWorld( true );
	root.getWorldScale( _tmpVec3C );
	return _tmpVec3C.x;

}

function computeNodeBoundsInRootSpace( root, node, measurementScale = 1 ) {

	root.updateMatrixWorld( true );
	const toRootSpace = new THREE.Matrix4().copy( root.matrixWorld ).invert();
	const bounds = new THREE.Box3().makeEmpty();
	let foundMesh = false;

	node.traverse( ( child ) => {

		if ( ! child.isMesh || ! child.geometry ) return;

		const positionAttr = child.geometry.getAttribute( 'position' );
		if ( ! positionAttr ) return;

		foundMesh = true;
		const toLocal = new THREE.Matrix4().multiplyMatrices( toRootSpace, child.matrixWorld );

		for ( let i = 0; i < positionAttr.count; i ++ ) {

			_tmpVec3A.fromBufferAttribute( positionAttr, i ).applyMatrix4( toLocal ).multiplyScalar( measurementScale );
			bounds.expandByPoint( _tmpVec3A );

		}

	} );

	return foundMesh ? bounds : null;

}

function computeNodeOriginInRootSpace( root, node, measurementScale = 1 ) {

	root.updateMatrixWorld( true );
	const toRootSpace = new THREE.Matrix4().copy( root.matrixWorld ).invert();
	return _tmpVec3A.set( 0, 0, 0 ).applyMatrix4( node.matrixWorld ).applyMatrix4( toRootSpace ).multiplyScalar( measurementScale );

}

export function createVehicleWallProbe( model ) {

	const colliderNode = findNamedNode( model, ( name ) => name.includes( 'collider' ) );
	const probeSource = colliderNode || findNamedNode( model, ( name ) => name === 'body' ) || model;
	const measurementScale = getRootUniformScale( model );
	const bounds = computeNodeBoundsInRootSpace( model, probeSource, measurementScale );

	if ( ! bounds || bounds.isEmpty() ) {

		return {
			probes: [
				{ offsetX: 0, offsetY: 0.72, offsetZ: 0.8, radius: 0.5, halfY: 0.2, halfLength: 0.5 },
				{ offsetX: 0, offsetY: 0.72, offsetZ: - 0.5, radius: 0.5, halfY: 0.2, halfLength: 0.5 },
			],
		};

	}

	bounds.getCenter( _tmpVec3A );
	bounds.getSize( _tmpVec3B );

	const halfWidth = _tmpVec3B.x * 0.5;
	const probeRadius = THREE.MathUtils.clamp(
		Math.min( _tmpVec3B.x * 0.28, _tmpVec3B.z * 0.16 ),
		0.18,
		0.34
	);
	// Keep the bumper helpers above the rolling sphere so low obstacles still feel climbable.
	const bumperBottom = Math.max( bounds.min.y + _tmpVec3B.y * BUMPER_CLEARANCE_RATIO, MIN_BUMPER_BOTTOM );
	const bumperHeight = Math.max( Math.min( _tmpVec3B.y * BUMPER_HEIGHT_RATIO, _tmpVec3B.y ), MIN_BUMPER_HALF_HEIGHT * 2 );
	const bumperTop = Math.min( bounds.max.y, bumperBottom + bumperHeight );
	const halfY = Math.max( ( bumperTop - bumperBottom ) * 0.5, MIN_BUMPER_HALF_HEIGHT );
	const offsetY = THREE.MathUtils.clamp( bumperBottom + halfY, bounds.min.y + halfY, bounds.max.y - halfY );
	const sideOffsetX = Math.max( halfWidth - probeRadius, 0 );
	const frontOffsetZ = Math.max( bounds.max.z - probeRadius, _tmpVec3A.z );
	const rearOffsetZ = Math.min( bounds.min.z + probeRadius, _tmpVec3A.z );
	const lateralOffsets = sideOffsetX > 1e-4 ? [ - sideOffsetX, 0, sideOffsetX ] : [ 0 ];
	const probes = [];

	for ( const offsetX of lateralOffsets ) {

		probes.push( {
			offsetX: _tmpVec3A.x + offsetX,
			offsetY,
			offsetZ: frontOffsetZ,
			radius: probeRadius,
			halfY,
			halfLength: probeRadius,
		} );
		probes.push( {
			offsetX: _tmpVec3A.x + offsetX,
			offsetY,
			offsetZ: rearOffsetZ,
			radius: probeRadius,
			halfY,
			halfLength: probeRadius,
		} );

	}

	return {
		probes,
	};

}

function computeCircleWallPush( circleCenter, radius, wall ) {

	const cosWall = Math.cos( wall.angle );
	const sinWall = Math.sin( wall.angle );
	const dx = circleCenter.x - wall.centerX;
	const dz = circleCenter.y - wall.centerZ;

	const localX = dx * cosWall + dz * sinWall;
	const localZ = - dx * sinWall + dz * cosWall;

	const clampedX = THREE.MathUtils.clamp( localX, - wall.halfX, wall.halfX );
	const clampedZ = THREE.MathUtils.clamp( localZ, - wall.halfZ, wall.halfZ );
	const deltaX = localX - clampedX;
	const deltaZ = localZ - clampedZ;
	const distSq = deltaX * deltaX + deltaZ * deltaZ;

	if ( distSq > 1e-8 ) {

		const dist = Math.sqrt( distSq );
		const overlap = radius - dist;
		if ( overlap <= 0 ) return null;

		const normalLocalX = deltaX / dist;
		const normalLocalZ = deltaZ / dist;
		return _tmpVec2A.set(
			( normalLocalX * cosWall - normalLocalZ * sinWall ) * ( overlap + 0.001 ),
			( normalLocalX * sinWall + normalLocalZ * cosWall ) * ( overlap + 0.001 )
		).clone();

	}

	const penX = wall.halfX - Math.abs( localX );
	const penZ = wall.halfZ - Math.abs( localZ );

	if ( penX < penZ ) {

		const signX = localX >= 0 ? 1 : - 1;
		return _tmpVec2A.set(
			cosWall * signX * ( radius + penX + 0.001 ),
			sinWall * signX * ( radius + penX + 0.001 )
		).clone();

	}

	const signZ = localZ >= 0 ? 1 : - 1;
	return _tmpVec2A.set(
		- sinWall * signZ * ( radius + penZ + 0.001 ),
		cosWall * signZ * ( radius + penZ + 0.001 )
	).clone();

}

export function resolveVehicleWallProbe( world, vehicle, wallProbeBoxes, vehicleWallProbe ) {

	if ( ! vehicle?.rigidBody || ! wallProbeBoxes?.length || ! vehicleWallProbe ) return 0;

	const container = vehicle.container;
	const probes = Array.isArray( vehicleWallProbe.probes ) && vehicleWallProbe.probes.length ?
		vehicleWallProbe.probes :
		[ vehicleWallProbe ];
	const forward = _tmpVec3A.set( 0, 0, 1 ).applyQuaternion( container.quaternion );
	forward.y = 0;
	if ( forward.lengthSq() > 0 ) forward.normalize();
	const probeAxisGroundZ = _probeAxisGroundZ.set( forward.x, forward.z );

	let corrected = false;

	for ( let iteration = 0; iteration < 4; iteration ++ ) {

		let largestPush = null;
		let largestPushLengthSq = 0;

		for ( const wall of wallProbeBoxes ) {

			if ( wall.kind === 'corner' ) continue;

				for ( const probe of probes ) {

					const worldOffset = _tmpVec3C.set( probe.offsetX, probe.offsetY, probe.offsetZ ).applyQuaternion( container.quaternion );
					const probeCenterY = vehicle.spherePos.y - VEHICLE_SPHERE_RADIUS + worldOffset.y;
					const probeMinY = probeCenterY - probe.halfY;
					const probeMaxY = probeCenterY + probe.halfY;
					const wallMinY = wall.centerY - wall.halfY;
					const wallMaxY = wall.centerY + wall.halfY;

					// Ignore low obstacles that only the sphere should interact with.
					if ( probeMaxY <= wallMinY || probeMinY >= wallMaxY ) continue;

				const probeCenter = _probeCenter2D.set(
					vehicle.spherePos.x + worldOffset.x,
					vehicle.spherePos.z + worldOffset.z
				);
				const segmentHalfLength = Math.max( probe.halfLength - probe.radius, 0 );
				const sampleOffsets = segmentHalfLength > 1e-4 ? CAPSULE_SAMPLE_OFFSETS : SPHERE_SAMPLE_OFFSETS;
				let push = null;

				for ( const sampleOffset of sampleOffsets ) {

					const sampleCenter = _tmpVec2B.set(
						probeCenter.x + probeAxisGroundZ.x * segmentHalfLength * sampleOffset,
						probeCenter.y + probeAxisGroundZ.y * segmentHalfLength * sampleOffset
					);
					const samplePush = computeCircleWallPush( sampleCenter, probe.radius, wall );

					if ( ! samplePush ) continue;
					if ( ! push || samplePush.lengthSq() > push.lengthSq() ) push = samplePush.clone();

				}

				if ( ! push ) continue;

				const pushLengthSq = push.lengthSq();
				if ( pushLengthSq > largestPushLengthSq ) {

					largestPush = push;
					largestPushLengthSq = pushLengthSq;

				}

			}

		}

		if ( ! largestPush ) break;

		vehicle.spherePos.x += largestPush.x;
		vehicle.spherePos.z += largestPush.y;
		corrected = true;

	}

	if ( ! corrected ) return 0;

	rigidBody.setPosition( world, vehicle.rigidBody, [
		vehicle.spherePos.x,
		vehicle.spherePos.y,
		vehicle.spherePos.z
	], false );

	const velocity = vehicle.rigidBody.motionProperties.linearVelocity;
	const correction = _tmpVec2A.set(
		vehicle.spherePos.x - vehicle.container.position.x,
		vehicle.spherePos.z - vehicle.container.position.z
	);

	vehicle.container.position.set(
		vehicle.spherePos.x,
		vehicle.spherePos.y - VEHICLE_SPHERE_RADIUS,
		vehicle.spherePos.z
	);

	if ( correction.lengthSq() > 0 ) {

		correction.normalize();
		const intoWall = velocity[ 0 ] * correction.x + velocity[ 2 ] * correction.y;
		const impactVelocity = Math.max( 0, - intoWall );

		if ( intoWall < 0 ) {

			const reflectedNormalSpeed = - intoWall * ( 1 + WALL_PROBE_BOUNCE );
			const nextVelocityX = velocity[ 0 ] + correction.x * reflectedNormalSpeed;
			const nextVelocityZ = velocity[ 2 ] + correction.y * reflectedNormalSpeed;
			rigidBody.setLinearVelocity( world, vehicle.rigidBody, [
				nextVelocityX,
				velocity[ 1 ],
				nextVelocityZ
			] );
			vehicle.sphereVel.x = nextVelocityX;
			vehicle.sphereVel.z = nextVelocityZ;

		}

		return impactVelocity;

	}

	return 0;

}

export function createSphereBody( world, spawnPos, collisionGroups, collisionMask ) {

	const initialPosition = spawnPos ?
		[ spawnPos[ 0 ], spawnPos[ 1 ] + VEHICLE_SPHERE_RADIUS - 0.5, spawnPos[ 2 ] ] :
		[ 3.5, VEHICLE_SPHERE_RADIUS, 5 ];

	const body = rigidBody.create( world, {
		shape: sphere.create( { radius: VEHICLE_SPHERE_RADIUS } ),
		motionType: MotionType.DYNAMIC,
		objectLayer: world._OL_MOVING,
		position: initialPosition,
		mass: 1000.0,
		friction: 5.0,
		restitution: 0.1,
		linearDamping: 0.1,
		angularDamping: 4.0,
		gravityFactor: 1.5,
		motionQuality: MotionQuality.LINEAR_CAST,
		collisionGroups,
		collisionMask,
	} );

	return body;

}
