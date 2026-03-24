import * as THREE from 'three';
import { rigidBody, box, sphere, MotionType, MotionQuality } from 'crashcat';
import { TRACK_CELLS, CELL_RAW, ORIENT_DEG, GRID_SCALE } from './Track.js';

const _debugMat = new THREE.MeshBasicMaterial( { color: 0x00ff00, wireframe: true } );
const VEHICLE_SPHERE_RADIUS = 1.0;
const _tmpVec3A = new THREE.Vector3();
const _tmpVec3B = new THREE.Vector3();
const _tmpVec2A = new THREE.Vector2();
const _tmpVec2B = new THREE.Vector2();
const _probeAxes = [
	new THREE.Vector2(),
	new THREE.Vector2(),
	new THREE.Vector2(),
	new THREE.Vector2(),
];

function addDebugBox( group, halfExtents, position, quaternion ) {

	const geo = new THREE.BoxGeometry( halfExtents[ 0 ] * 2, halfExtents[ 1 ] * 2, halfExtents[ 2 ] * 2 );
	const mesh = new THREE.Mesh( geo, _debugMat );
	mesh.position.set( position[ 0 ], position[ 1 ], position[ 2 ] );
	if ( quaternion ) mesh.quaternion.set( quaternion[ 0 ], quaternion[ 1 ], quaternion[ 2 ], quaternion[ 3 ] );
	group.add( mesh );

}

export function buildWallColliders( world, debugGroup, customCells ) {

	const S = GRID_SCALE;
	const CELL_HALF = CELL_RAW / 2;

	const WALL_HALF_THICK = 0.25;
	const WALL_X = 4.75;
	const WALL_HALF_H = 1.5;

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
			} );

			wallProbeBoxes.push( {
				centerX: position[ 0 ],
				centerZ: position[ 2 ],
				halfX: halfExtents[ 0 ],
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

		if ( key === 'track-straight' || key === 'track-finish' ) {

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
				} );

				wallProbeBoxes.push( {
					centerX: position[ 0 ],
					centerZ: position[ 2 ],
					halfX: halfExtents[ 0 ],
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

function findNamedNode( root, matcher ) {

	let matchedNode = null;

	root.traverse( ( child ) => {

		if ( matchedNode ) return;
		if ( child.name && matcher( child.name.toLowerCase() ) ) matchedNode = child;

	} );

	return matchedNode;

}

function computeNodeBoundsInRootSpace( root, node ) {

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

			_tmpVec3A.fromBufferAttribute( positionAttr, i ).applyMatrix4( toLocal );
			bounds.expandByPoint( _tmpVec3A );

		}

	} );

	return foundMesh ? bounds : null;

}

export function createVehicleWallProbe( model ) {

	const colliderNode = findNamedNode( model, ( name ) => name.includes( 'collider' ) );
	const probeSource = colliderNode || findNamedNode( model, ( name ) => name === 'body' ) || model;
	const bounds = computeNodeBoundsInRootSpace( model, probeSource );

	if ( ! bounds || bounds.isEmpty() ) {

		return {
			offsetX: 0,
			offsetZ: 0,
			halfX: 1.1,
			halfZ: 2.0,
		};

	}

	bounds.getCenter( _tmpVec3A );
	bounds.getSize( _tmpVec3B );

	return {
		offsetX: _tmpVec3A.x,
		offsetZ: _tmpVec3A.z,
		halfX: Math.max( _tmpVec3B.x * 0.5, 0.25 ),
		halfZ: Math.max( _tmpVec3B.z * 0.5, 0.25 ),
	};

}

function projectBoxRadius( halfX, halfZ, axis, boxAxisX, boxAxisZ ) {

	return Math.abs( axis.dot( boxAxisX ) ) * halfX + Math.abs( axis.dot( boxAxisZ ) ) * halfZ;

}

function computeBoxWallPush( probeCenter, probeHalfX, probeHalfZ, probeAngle, wall ) {

	const cosProbe = Math.cos( probeAngle );
	const sinProbe = Math.sin( probeAngle );
	const probeAxisX = _probeAxes[ 0 ].set( cosProbe, sinProbe );
	const probeAxisZ = _probeAxes[ 1 ].set( - sinProbe, cosProbe );

	const cosWall = Math.cos( wall.angle );
	const sinWall = Math.sin( wall.angle );
	const wallAxisX = _probeAxes[ 2 ].set( cosWall, sinWall );
	const wallAxisZ = _probeAxes[ 3 ].set( - sinWall, cosWall );

	const delta = _tmpVec2A.set( probeCenter.x - wall.centerX, probeCenter.y - wall.centerZ );
	let bestAxis = null;
	let bestOverlap = Infinity;

	for ( const axis of _probeAxes ) {

		const axisLengthSq = axis.lengthSq();
		if ( axisLengthSq === 0 ) continue;

		const normalizedAxis = _tmpVec2B.copy( axis ).multiplyScalar( 1 / Math.sqrt( axisLengthSq ) );
		const probeRadius = projectBoxRadius( probeHalfX, probeHalfZ, normalizedAxis, probeAxisX, probeAxisZ );
		const wallRadius = projectBoxRadius( wall.halfX, wall.halfZ, normalizedAxis, wallAxisX, wallAxisZ );
		const distance = Math.abs( delta.dot( normalizedAxis ) );
		const overlap = probeRadius + wallRadius - distance;

		if ( overlap <= 0 ) return null;
		if ( overlap < bestOverlap ) {

			bestOverlap = overlap;
			bestAxis = normalizedAxis.clone();

		}

	}

	if ( ! bestAxis ) return null;

	if ( delta.dot( bestAxis ) < 0 ) bestAxis.negate();

	return bestAxis.multiplyScalar( bestOverlap + 0.001 );

}

export function resolveVehicleWallProbe( world, vehicle, wallProbeBoxes, vehicleWallProbe ) {

	if ( ! vehicle?.rigidBody || ! wallProbeBoxes?.length || ! vehicleWallProbe ) return false;

	const yaw = vehicle.container.rotation.y;
	const cosYaw = Math.cos( yaw );
	const sinYaw = Math.sin( yaw );
	const probeCenter = new THREE.Vector2(
		vehicle.spherePos.x + vehicleWallProbe.offsetX * cosYaw + vehicleWallProbe.offsetZ * sinYaw,
		vehicle.spherePos.z - vehicleWallProbe.offsetX * sinYaw + vehicleWallProbe.offsetZ * cosYaw
	);

	let corrected = false;

	for ( let iteration = 0; iteration < 4; iteration ++ ) {

		let largestPush = null;
		let largestPushLengthSq = 0;

		for ( const wall of wallProbeBoxes ) {

			const push = computeBoxWallPush(
				probeCenter,
				vehicleWallProbe.halfX,
				vehicleWallProbe.halfZ,
				yaw,
				wall
			);

			if ( ! push ) continue;

			const pushLengthSq = push.lengthSq();
			if ( pushLengthSq > largestPushLengthSq ) {

				largestPush = push;
				largestPushLengthSq = pushLengthSq;

			}

		}

		if ( ! largestPush ) break;

		probeCenter.add( largestPush );
		vehicle.spherePos.x += largestPush.x;
		vehicle.spherePos.z += largestPush.y;
		corrected = true;

	}

	if ( ! corrected ) return false;

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

	if ( correction.lengthSq() > 0 ) {

		correction.normalize();
		const intoWall = velocity[ 0 ] * correction.x + velocity[ 2 ] * correction.y;

		if ( intoWall < 0 ) {

			const nextVelocityX = velocity[ 0 ] - correction.x * intoWall;
			const nextVelocityZ = velocity[ 2 ] - correction.y * intoWall;
			rigidBody.setLinearVelocity( world, vehicle.rigidBody, [
				nextVelocityX,
				velocity[ 1 ],
				nextVelocityZ
			] );
			vehicle.sphereVel.x = nextVelocityX;
			vehicle.sphereVel.z = nextVelocityZ;

		}

	}

	vehicle.container.position.set(
		vehicle.spherePos.x,
		vehicle.spherePos.y - VEHICLE_SPHERE_RADIUS,
		vehicle.spherePos.z
	);

	return true;

}

export function createSphereBody( world, spawnPos ) {

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
	} );

	return body;

}
