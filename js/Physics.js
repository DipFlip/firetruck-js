import * as THREE from 'three';
import { rigidBody, box, sphere, capsule, pointConstraint, ConstraintSpace, MotionType, MotionQuality, dof } from 'crashcat';
import { TRACK_CELLS, CELL_RAW, ORIENT_DEG, GRID_SCALE } from './Track.js';

const _debugMat = new THREE.MeshBasicMaterial( { color: 0x00ff00, wireframe: true } );
const VEHICLE_SPHERE_RADIUS = 0.5;
const VEHICLE_COLLISION_ALIGNMENT_INV = new THREE.Quaternion().setFromEuler( new THREE.Euler( - Math.PI / 2, 0, 0 ) );
const _tmpVec3A = new THREE.Vector3();
const _tmpVec3B = new THREE.Vector3();
const _tmpVec3C = new THREE.Vector3();
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
					collisionGroups,
					collisionMask,
				} );

					wallProbeBoxes.push( {
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

export function createVehicleCollisionProfile( model ) {

	const colliderNode = findNamedNode( model, ( name ) => name.includes( 'collider' ) );
	const profileSource = colliderNode || findNamedNode( model, ( name ) => name === 'body' ) || model;
	const bounds = computeNodeBoundsInRootSpace( model, profileSource );

	if ( ! bounds || bounds.isEmpty() ) {

		return {
			offsetX: 0,
			offsetY: 0.9,
			offsetZ: 0,
			radius: 0.45,
			halfHeightOfCylinder: 0.9,
		};

	}

	bounds.getCenter( _tmpVec3A );
	bounds.getSize( _tmpVec3B );

	const radius = Math.max( Math.min( _tmpVec3B.x, _tmpVec3B.y ) * 0.45, 0.25 );
	const halfLength = Math.max( _tmpVec3B.z * 0.5, radius );

	return {
		offsetX: _tmpVec3A.x,
		offsetY: _tmpVec3A.y,
		offsetZ: _tmpVec3A.z,
		radius,
		halfHeightOfCylinder: Math.max( halfLength - radius, 0 ),
	};

}

export function createVehicleCollisionBody( world, collisionProfile, position, quaternion, collisionGroups, collisionMask ) {

	return rigidBody.create( world, {
		shape: capsule.create( {
			radius: collisionProfile.radius,
			halfHeightOfCylinder: collisionProfile.halfHeightOfCylinder,
		} ),
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
		allowedDegreesOfFreedom: dof( true, true, true, false, false, false ),
		collisionGroups,
		collisionMask,
	} );

}

export function createVehicleCollisionConstraint( world, sphereBody, collisionBody, collisionProfile ) {

	const collisionAnchor = _tmpVec3C.set(
		- collisionProfile.offsetX,
		VEHICLE_SPHERE_RADIUS - collisionProfile.offsetY,
		- collisionProfile.offsetZ
	).applyQuaternion( VEHICLE_COLLISION_ALIGNMENT_INV );

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
			probes: [
				{ offsetX: 0, offsetY: 0.72, offsetZ: 0.8, radius: 0.5, halfY: 0.2, halfLength: 0.5 },
				{ offsetX: 0, offsetY: 0.72, offsetZ: - 0.5, radius: 0.5, halfY: 0.2, halfLength: 0.5 },
			],
		};

	}

	bounds.getCenter( _tmpVec3A );
	bounds.getSize( _tmpVec3B );

	const probeRadius = Math.max( Math.min( _tmpVec3B.x * 0.5, _tmpVec3B.z * 0.25 ), 0.25 );
	// Keep the bumper helpers above the rolling sphere so low obstacles still feel climbable.
	const bumperBottom = Math.max( bounds.min.y + _tmpVec3B.y * BUMPER_CLEARANCE_RATIO, MIN_BUMPER_BOTTOM );
	const bumperHeight = Math.max( Math.min( _tmpVec3B.y * BUMPER_HEIGHT_RATIO, _tmpVec3B.y ), MIN_BUMPER_HALF_HEIGHT * 2 );
	const bumperTop = Math.min( bounds.max.y, bumperBottom + bumperHeight );
	const halfY = Math.max( ( bumperTop - bumperBottom ) * 0.5, MIN_BUMPER_HALF_HEIGHT );
	const offsetY = THREE.MathUtils.clamp( bumperBottom + halfY, bounds.min.y + halfY, bounds.max.y - halfY );
	const frontOffsetZ = Math.max( bounds.max.z - probeRadius, _tmpVec3A.z );
	const rearOffsetZ = Math.min( bounds.min.z + probeRadius, _tmpVec3A.z );

	return {
		probes: [
			{
				offsetX: _tmpVec3A.x,
				offsetY,
				offsetZ: frontOffsetZ,
				radius: probeRadius,
				halfY,
				halfLength: probeRadius,
			},
			{
				offsetX: _tmpVec3A.x,
				offsetY,
				offsetZ: rearOffsetZ,
				radius: probeRadius,
				halfY,
				halfLength: probeRadius,
			},
		],
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
