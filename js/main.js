import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createWorldSettings, createWorld, addBroadphaseLayer, addObjectLayer, enableCollision, registerAll, updateWorld, rigidBody, box, sphere, castShape, createClosestCastShapeCollector, createDefaultCastShapeSettings, CastShapeStatus, filter, MotionType } from 'crashcat';
import { Vehicle } from './Vehicle.js';
import { Camera } from './Camera.js';
import { Controls } from './Controls.js';
import { buildTrack, decodeCells, computeSpawnPosition, computeTrackBounds, getForestTreeSpawnPlacements } from './Track.js';
import { buildWallColliders, buildRampColliders, buildTrackObstacleColliders, createDecorationColliderSystem, createSphereBody, createVehicleCollisionProfile, createVehicleCollisionBody, createVehicleCollisionConstraint, createVehicleWallProbe, resolveVehicleWallProbe } from './Physics.js';
import { Effects } from './Particles.js';
import { GameAudio } from './Audio.js';
import { FireTargetSystem } from './FireTargets.js';
import { ScorePopupSystem } from './ScorePopups.js';


const renderer = new THREE.WebGLRenderer( { antialias: true, outputBufferType: THREE.HalfFloatType } );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ) );
bloomPass.strength = 0.02;
bloomPass.radius = 0.02;
bloomPass.threshold = 0.5;

renderer.setEffects( [ bloomPass ] );

document.body.appendChild( renderer.domElement );

const scene = new THREE.Scene();
scene.background = new THREE.Color( 0xadb2ba );
scene.fog = new THREE.Fog( 0xadb2ba, 30, 55 );

const VEHICLE_SPHERE_RADIUS = 0.5;
const GROUP_GROUND = 1 << 0;
const GROUP_WALL = 1 << 1;
const GROUP_VEHICLE_SPHERE = 1 << 2;
const GROUP_VEHICLE_COLLIDER = 1 << 3;
const GROUND_COLLISION_MASK = GROUP_VEHICLE_SPHERE | GROUP_VEHICLE_COLLIDER;
const VEHICLE_COLLIDER_MASK = GROUP_WALL | GROUP_GROUND;
const GROUND_PROBE_START_HEIGHT = 2.5;
const GROUND_PROBE_RAY_FAR = 4.5;
const GROUND_CONTACT_DISTANCE = 0.75;
const GROUND_CONTACT_LENIENCY = 0.18;
const GROUND_PROBE_RADIUS = 0.05;
const GROUND_SURFACE_OVERLAP_TOLERANCE = 0.12;
const WATER_RANGE = 31.2;
const WATER_GROUND_Y = 0.05;
const WATER_SPEED = 14.4;
const WATER_GRAVITY = 18;
const WATER_SEGMENT_DT = 0.06;
const WATER_SEGMENT_COUNT = 20;
const WATER_AIM_ASSIST_RADIUS = 3.45;
const WATER_AIM_ASSIST_DISTANCE = 5.0;
const WATER_TANK_CAPACITY = 6.0;
const WATER_DRAIN_PER_SECOND = 0.9;
const WATER_PICKUP_COUNT = 24;
const WATER_PICKUP_RESPAWN_TIME = 60;
const WATER_PICKUP_PICKUP_RADIUS = 2.025;
const WATER_PICKUP_MIN_DISTANCE_FROM_SPAWN = 9;
const WATER_PICKUP_MIN_SEPARATION = 8;
const WATER_PICKUP_REFILL_WISP_COUNT = 10;
const WATER_PICKUP_REFILL_WISP_TIME = 0.6;
const LOOK_POINT_SPEED_SCALE = 0.8;
const LOOK_POINT_OFFSET_SETTLE = 1.5;
const LOOK_POINT_DAMPING_RATIO = 1.0;
const LOOK_POINT_MAX_DISTANCE = 5.0;
const FIRE_EXTINGUISH_SCORE = 10;
const FIRE_START_AMOUNT = 0.25;
const INITIAL_FIRE_COUNT = 5;
const MAX_ACTIVE_FIRES = 10;
const FIRE_SPAWN_INTERVAL_MIN = 1.5;
const FIRE_SPAWN_INTERVAL_MAX = 5;
const FIRE_SPAWN_MIN_DISTANCE = 9;
const FIRE_SPAWN_NEAR_DISTANCE = 22;
const FIRE_SPAWN_FALLBACK_DISTANCE = 34;
const debugUi = document.createElement( 'label' );
debugUi.style.position = 'absolute';
debugUi.style.left = '16px';
debugUi.style.bottom = '16px';
debugUi.style.display = 'flex';
debugUi.style.alignItems = 'center';
debugUi.style.gap = '8px';
debugUi.style.padding = '8px 10px';
debugUi.style.color = '#fff';
debugUi.style.font = '13px sans-serif';
debugUi.style.background = 'rgba(0, 0, 0, 0.55)';
debugUi.style.borderRadius = '6px';
debugUi.style.zIndex = '10';
debugUi.style.userSelect = 'none';

const debugSphereToggle = document.createElement( 'input' );
debugSphereToggle.type = 'checkbox';
debugUi.appendChild( debugSphereToggle );
debugUi.appendChild( document.createTextNode( 'Debug' ) );
document.body.appendChild( debugUi );

const statusUi = document.createElement( 'div' );
statusUi.style.position = 'absolute';
statusUi.style.left = '16px';
statusUi.style.top = '16px';
statusUi.style.padding = '10px 12px';
statusUi.style.color = '#fff';
statusUi.style.font = '13px sans-serif';
statusUi.style.lineHeight = '1.45';
statusUi.style.whiteSpace = 'pre-line';
statusUi.style.background = 'rgba(0, 0, 0, 0.5)';
statusUi.style.borderRadius = '6px';
statusUi.style.zIndex = '10';
statusUi.style.userSelect = 'none';
document.body.appendChild( statusUi );

const waterMeterUi = document.createElement( 'div' );
waterMeterUi.style.position = 'absolute';
waterMeterUi.style.left = '50%';
waterMeterUi.style.top = '16px';
waterMeterUi.style.width = '280px';
waterMeterUi.style.padding = '10px 12px 12px';
waterMeterUi.style.color = '#d8f6ff';
waterMeterUi.style.font = '12px "Arial Rounded MT Bold", "Trebuchet MS", "Arial Black", sans-serif';
waterMeterUi.style.background = 'rgba(7, 18, 28, 0.62)';
waterMeterUi.style.border = '1px solid rgba(120, 220, 255, 0.28)';
waterMeterUi.style.borderRadius = '999px';
waterMeterUi.style.transform = 'translateX(-50%)';
waterMeterUi.style.transformOrigin = '50% 50%';
waterMeterUi.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.18)';
waterMeterUi.style.zIndex = '10';
waterMeterUi.style.userSelect = 'none';

const waterMeterLabel = document.createElement( 'div' );
waterMeterLabel.textContent = 'WATER TANK';
waterMeterLabel.style.marginBottom = '8px';
waterMeterLabel.style.fontSize = '13px';
waterMeterLabel.style.letterSpacing = '0.1em';
waterMeterLabel.style.opacity = '0.92';
waterMeterLabel.style.textAlign = 'center';
waterMeterLabel.style.textShadow = '0 1px 0 rgba(0, 0, 0, 0.3)';
waterMeterUi.appendChild( waterMeterLabel );

const waterMeterTrack = document.createElement( 'div' );
waterMeterTrack.style.position = 'relative';
waterMeterTrack.style.height = '14px';
waterMeterTrack.style.background = 'rgba(255, 255, 255, 0.08)';
waterMeterTrack.style.borderRadius = '999px';
waterMeterTrack.style.overflow = 'hidden';
waterMeterTrack.style.boxShadow = 'inset 0 1px 2px rgba(0, 0, 0, 0.45)';
waterMeterUi.appendChild( waterMeterTrack );

const waterMeterFill = document.createElement( 'div' );
waterMeterFill.style.position = 'absolute';
waterMeterFill.style.left = '0';
waterMeterFill.style.top = '0';
waterMeterFill.style.bottom = '0';
waterMeterFill.style.width = '100%';
waterMeterFill.style.transformOrigin = '0 50%';
waterMeterFill.style.borderRadius = '999px';
waterMeterFill.style.background = 'linear-gradient(90deg, #2b89ff 0%, #56d8ff 48%, #d4fbff 100%)';
waterMeterFill.style.boxShadow = '0 0 18px rgba(86, 216, 255, 0.38)';
waterMeterTrack.appendChild( waterMeterFill );

document.body.appendChild( waterMeterUi );

const debugSphere = new THREE.Mesh(
	new THREE.SphereGeometry( 0.5, 20, 12 ),
	new THREE.MeshBasicMaterial( {
		color: 0x00ff88,
		wireframe: true,
		transparent: true,
		opacity: 0.8,
		depthWrite: false,
	} )
);
debugSphere.visible = false;
scene.add( debugSphere );
const debugAimAssistSphere = new THREE.Mesh(
	new THREE.SphereGeometry( WATER_AIM_ASSIST_RADIUS, 18, 10 ),
	new THREE.MeshBasicMaterial( {
		color: 0x66ccff,
		wireframe: true,
		transparent: true,
		opacity: 0.45,
		depthWrite: false,
	} )
);
debugAimAssistSphere.visible = false;
scene.add( debugAimAssistSphere );
const lookPoint = new THREE.Mesh(
	new THREE.SphereGeometry( 0.3, 16, 10 ),
	new THREE.MeshBasicMaterial( {
		color: 0xff44aa,
		wireframe: true,
		transparent: true,
		opacity: 0.9,
		depthWrite: false,
	} )
);
lookPoint.visible = false;
scene.add( lookPoint );
const debugProbeOffset = new THREE.Vector3();
const debugWallGroup = new THREE.Group();
debugWallGroup.visible = false;
scene.add( debugWallGroup );
const groundProbeBase = new THREE.Vector3();
const groundProbeOrigin = new THREE.Vector3();
const groundProbeWorld = new THREE.Vector3();
const groundProbeNormal = new THREE.Vector3();
const groundProbeForward = new THREE.Vector3();
const groundProbeRight = new THREE.Vector3();
const groundHitNormal = new THREE.Vector3();
const supportForward = new THREE.Vector3();
const supportLateral = new THREE.Vector3();
const supportPlaneNormal = new THREE.Vector3();
const supportAverageNormal = new THREE.Vector3();
const supportMidA = new THREE.Vector3();
const supportMidB = new THREE.Vector3();
const capsuleVisualQuat = new THREE.Quaternion();
const capsuleUp = new THREE.Vector3();
const groundProbeOriginArray = [ 0, 0, 0 ];
const groundProbeQuatArray = [ 0, 0, 0, 1 ];
const groundProbeScaleArray = [ 1, 1, 1 ];
const groundProbeDisplacementArray = [ 0, - GROUND_PROBE_RAY_FAR, 0 ];
const debugProbeMaterial = new THREE.MeshBasicMaterial( {
	color: 0xffaa00,
	wireframe: true,
	transparent: true,
	opacity: 0.8,
	depthWrite: false,
} );
const debugProbeBox = new THREE.Mesh(
	new THREE.CapsuleGeometry( 0.5, 1, 4, 8 ),
	debugProbeMaterial
);
debugProbeBox.visible = false;
scene.add( debugProbeBox );
let playerVehicleGroup = null;
let fireTargetSystem = null;
const rampVisualPieces = [];
const fireSpawnPoint = new THREE.Vector2();
const fireImpactPoint = new THREE.Vector3();
const fireImpactNormal = new THREE.Vector3( 0, 1, 0 );
const waterArcStart = new THREE.Vector3();
const waterArcEnd = new THREE.Vector3();
const waterArcVelocity = new THREE.Vector3();
const waterLaunchVelocity = new THREE.Vector3();
const waterWorldUp = new THREE.Vector3( 0, 1, 0 );
const driveViewForward = new THREE.Vector3();
const driveViewRight = new THREE.Vector3();
const waterViewForward = new THREE.Vector3();
const waterViewRight = new THREE.Vector3();
const waterAimAssistPoint = new THREE.Vector3();
const waterAimAssistOffset = new THREE.Vector3();
const waterAimAssistRelativeVelocity = new THREE.Vector3();
const waterAimAssistLaunchVelocity = new THREE.Vector3();
const waterAssistNormal = new THREE.Vector3();
const lookPointOffset = new THREE.Vector3();
const lookPointSmoothedOffset = new THREE.Vector3();
const lookPointOffsetVelocity = new THREE.Vector3();
const pendingWaterImpacts = [];
const _fireSeparation = new THREE.Vector2();
const _fireSpawnOffset = new THREE.Vector2();
const _lookPointAccel = new THREE.Vector3();
const _lookPointNormal = new THREE.Vector3();
const _pickupSeparation = new THREE.Vector2();
const _refillBurstTarget = new THREE.Vector3();

function shuffleInPlace( values ) {

	for ( let i = values.length - 1; i > 0; i -- ) {

		const j = Math.floor( Math.random() * ( i + 1 ) );
		[ values[ i ], values[ j ] ] = [ values[ j ], values[ i ] ];

	}

	return values;

}

function randomFireSpawnInterval() {

	return THREE.MathUtils.randFloat( FIRE_SPAWN_INTERVAL_MIN, FIRE_SPAWN_INTERVAL_MAX );

}

function settleFactor( dt, settleTime ) {

	return 1 - Math.exp( - 3 * dt / settleTime );

}

function springOffset( current, velocity, target, dt, settleTime, dampingRatio = 1 ) {

	if ( dt <= 0 ) return;

	const omega = 4 / Math.max( settleTime, 1e-3 );
	_lookPointAccel.copy( target )
		.sub( current )
		.multiplyScalar( omega * omega )
		.addScaledVector( velocity, - 2 * dampingRatio * omega );

	velocity.addScaledVector( _lookPointAccel, dt );
	current.addScaledVector( velocity, dt );

}

function addFireSpawnCandidate( candidates, position, minDistance = 6.25 ) {

	for ( const candidate of candidates ) {

		_fireSeparation.set( candidate.x - position.x, candidate.z - position.z );
		if ( _fireSeparation.length() < minDistance ) return false;

	}

	candidates.push( {
		x: position.x,
		y: position.y ?? 0,
		z: position.z,
		fireAmount: position.fireAmount ?? FIRE_START_AMOUNT,
		rotationY: position.rotationY ?? 0,
	} );
	return true;

}

function takeNearbyFireSpawn( candidates, playerPosition ) {

	if ( candidates.length === 0 ) return null;

	const validCandidates = [];

	for ( let i = 0; i < candidates.length; i ++ ) {

		const candidate = candidates[ i ];
		_fireSpawnOffset.set( candidate.x - playerPosition.x, candidate.z - playerPosition.z );
		const distance = _fireSpawnOffset.length();
		if ( distance < FIRE_SPAWN_MIN_DISTANCE ) continue;

		validCandidates.push( {
			index: i,
			distance,
		} );

	}

	if ( validCandidates.length === 0 ) return null;

	validCandidates.sort( ( a, b ) => a.distance - b.distance );

	const nearbyPool = validCandidates.filter( ( candidate ) => candidate.distance <= FIRE_SPAWN_NEAR_DISTANCE );
	const fallbackPool = validCandidates.filter( ( candidate ) => candidate.distance <= FIRE_SPAWN_FALLBACK_DISTANCE );
	const selectionPool = nearbyPool.length > 0
		? nearbyPool.slice( 0, Math.min( nearbyPool.length, 6 ) )
		: fallbackPool.length > 0
			? fallbackPool.slice( 0, Math.min( fallbackPool.length, 6 ) )
			: validCandidates.slice( 0, Math.min( validCandidates.length, 4 ) );

	const choice = selectionPool[ Math.floor( Math.random() * selectionPool.length ) ];
	return candidates.splice( choice.index, 1 )[ 0 ] ?? null;

}

function buildWaterPickupPositions( bounds, spawn ) {

	if ( spawn ) {

		fireSpawnPoint.set( spawn.position[ 0 ], spawn.position[ 2 ] );

	} else {

		fireSpawnPoint.set( bounds.centerX, bounds.centerZ );

	}

	const pickups = [];
	const minX = bounds.centerX - bounds.halfWidth - 3;
	const maxX = bounds.centerX + bounds.halfWidth + 3;
	const minZ = bounds.centerZ - bounds.halfDepth - 3;
	const maxZ = bounds.centerZ + bounds.halfDepth + 3;
	const maxAttempts = WATER_PICKUP_COUNT * 18;

	for ( let attempt = 0; attempt < maxAttempts && pickups.length < WATER_PICKUP_COUNT; attempt ++ ) {

		const x = THREE.MathUtils.randFloat( minX, maxX );
		const z = THREE.MathUtils.randFloat( minZ, maxZ );
		const distSpawn = Math.hypot( x - fireSpawnPoint.x, z - fireSpawnPoint.y );
		if ( distSpawn < WATER_PICKUP_MIN_DISTANCE_FROM_SPAWN ) continue;

		let tooClose = false;

		for ( const pickup of pickups ) {

			_pickupSeparation.set( x - pickup.x, z - pickup.z );
			if ( _pickupSeparation.length() < WATER_PICKUP_MIN_SEPARATION ) {

				tooClose = true;
				break;

			}

		}

		if ( tooClose ) continue;

		pickups.push( {
			x,
			y: 1.15,
			z,
		} );

	}

	return pickups;

}

function computeFallbackWaterImpact( origin, launchVelocity, maxRange ) {

	waterArcStart.copy( origin );
	waterArcVelocity.copy( launchVelocity );
	let travelled = 0;

	for ( let i = 0; i < WATER_SEGMENT_COUNT; i ++ ) {

		waterArcEnd.copy( waterArcStart ).addScaledVector( waterArcVelocity, WATER_SEGMENT_DT );
		travelled += waterArcStart.distanceTo( waterArcEnd );
		if ( travelled > maxRange ) break;

		if ( waterArcEnd.y <= WATER_GROUND_Y ) {

			fireImpactPoint.copy( waterArcEnd );
			fireImpactPoint.y = WATER_GROUND_Y;
			fireImpactNormal.set( 0, 1, 0 );

			return {
				hit: false,
				impactPoint: fireImpactPoint.clone(),
				impactNormal: fireImpactNormal.clone(),
				distance: origin.distanceTo( fireImpactPoint ),
				travelTime: i * WATER_SEGMENT_DT + waterArcStart.distanceTo( fireImpactPoint ) / Math.max( waterArcVelocity.length(), 1e-4 ),
			};

		}

		waterArcStart.copy( waterArcEnd );
		waterArcVelocity.y -= WATER_GRAVITY * WATER_SEGMENT_DT;

	}

	fireImpactPoint.copy( waterArcStart );
	fireImpactNormal.set( 0, 1, 0 );

	return {
		hit: false,
		impactPoint: fireImpactPoint.clone(),
		impactNormal: fireImpactNormal.clone(),
		distance,
		travelTime: WATER_SEGMENT_COUNT * WATER_SEGMENT_DT,
	};

}

function solveAimAssistShot( origin, targetPoint, inheritedVelocity, launchSpeed ) {

	waterAimAssistOffset.copy( targetPoint ).sub( origin );

	function relativeSpeedError( time ) {

		waterAimAssistRelativeVelocity.copy( waterAimAssistOffset ).divideScalar( time ).sub( inheritedVelocity );
		waterAimAssistRelativeVelocity.y += 0.5 * WATER_GRAVITY * time;
		return waterAimAssistRelativeVelocity.length() - launchSpeed;

	}

	const minTime = 0.08;
	const maxTime = Math.max( 2.25, WATER_RANGE / Math.max( launchSpeed, 1e-4 ) );
	let prevTime = minTime;
	let prevError = relativeSpeedError( prevTime );

	for ( let i = 1; i <= 48; i ++ ) {

		const time = THREE.MathUtils.lerp( minTime, maxTime, i / 48 );
		const error = relativeSpeedError( time );

		if ( prevError === 0 || error === 0 || prevError < 0 !== error < 0 ) {

			let lowTime = prevTime;
			let highTime = time;
			let lowError = prevError;

			for ( let iteration = 0; iteration < 14; iteration ++ ) {

				const midTime = ( lowTime + highTime ) * 0.5;
				const midError = relativeSpeedError( midTime );

				if ( Math.abs( midError ) <= 1e-3 ) {

					lowTime = highTime = midTime;
					break;

				}

				if ( lowError < 0 !== midError < 0 ) {

					highTime = midTime;

				} else {

					lowTime = midTime;
					lowError = midError;

				}

			}

			const travelTime = ( lowTime + highTime ) * 0.5;
			waterAimAssistRelativeVelocity.copy( waterAimAssistOffset ).divideScalar( travelTime ).sub( inheritedVelocity );
			waterAimAssistRelativeVelocity.y += 0.5 * WATER_GRAVITY * travelTime;

			if ( waterAimAssistRelativeVelocity.lengthSq() <= 1e-8 ) return null;

			waterAimAssistLaunchVelocity.copy( waterAimAssistRelativeVelocity ).add( inheritedVelocity );

			waterAssistNormal.copy( origin ).sub( targetPoint );
			if ( waterAssistNormal.lengthSq() > 1e-6 ) waterAssistNormal.normalize();
			else waterAssistNormal.set( 0, 1, 0 );

			return {
				aimDirection: waterAimAssistRelativeVelocity.clone().normalize(),
				launchVelocity: waterAimAssistLaunchVelocity.clone(),
				travelTime,
				impactPoint: targetPoint.clone(),
				impactNormal: waterAssistNormal.clone(),
			};

		}

		prevTime = time;
		prevError = error;

	}

	return null;

}

function buildFireSpawnPositions( models, customCells, bounds, spawn ) {

	const treePlacements = getForestTreeSpawnPlacements( models, customCells );
	if ( treePlacements.length === 0 ) return [];

	if ( spawn ) {

		fireSpawnPoint.set( spawn.position[ 0 ], spawn.position[ 2 ] );

	} else {

		fireSpawnPoint.set( bounds.centerX, bounds.centerZ );

	}

	const candidates = [];
	const nearbyTrees = [];
	const remainingTrees = [];

	for ( const treePlacement of treePlacements ) {

		const distSpawn = Math.hypot( treePlacement.x - fireSpawnPoint.x, treePlacement.z - fireSpawnPoint.y );
		if ( distSpawn < 7 ) continue;

		if ( distSpawn <= 18 ) {

			nearbyTrees.push( { treePlacement, distSpawn } );

		} else {

			remainingTrees.push( treePlacement );

		}

	}

	nearbyTrees.sort( ( a, b ) => a.distSpawn - b.distSpawn );
	shuffleInPlace( remainingTrees );

	for ( const { treePlacement } of nearbyTrees ) {
		addFireSpawnCandidate( candidates, {
			x: treePlacement.x,
			y: treePlacement.y,
			z: treePlacement.z,
			fireAmount: FIRE_START_AMOUNT,
			rotationY: treePlacement.rotationY,
		}, 4.25 );

	}

	for ( const treePlacement of remainingTrees ) {

		addFireSpawnCandidate( candidates, {
			x: treePlacement.x,
			y: treePlacement.y,
			z: treePlacement.z,
			fireAmount: FIRE_START_AMOUNT,
			rotationY: treePlacement.rotationY,
		}, 4.25 );

	}

	return candidates;

}

debugSphereToggle.addEventListener( 'change', () => {

	debugSphere.visible = debugSphereToggle.checked;
	debugAimAssistSphere.visible = debugSphereToggle.checked;
	lookPoint.visible = debugSphereToggle.checked;
	debugProbeBox.visible = debugSphereToggle.checked;
	debugWallGroup.visible = debugSphereToggle.checked;
	if ( playerVehicleGroup ) playerVehicleGroup.visible = ! debugSphereToggle.checked;

	for ( const rampPiece of rampVisualPieces ) {

		rampPiece.visible = ! debugSphereToggle.checked;

	}

	fireTargetSystem?.setDebugVisible( debugSphereToggle.checked );

} );

const dirLight = new THREE.DirectionalLight( 0xffffff, 5 );
dirLight.position.set( 11.4, 15, -5.3 );
dirLight.castShadow = true;
dirLight.shadow.mapSize.setScalar( 4096 );
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 60;
dirLight.shadow.camera.left = -30;
dirLight.shadow.camera.right = 30;
dirLight.shadow.camera.top = 30;
dirLight.shadow.camera.bottom = -30;
scene.add( dirLight );

const hemiLight = new THREE.HemisphereLight( 0xc8d8e8, 0x7a8a5a, 1.5 );
scene.add( hemiLight );


window.addEventListener( 'resize', () => {

	renderer.setSize( window.innerWidth, window.innerHeight );

} );

const loader = new GLTFLoader();
const PLAYER_VEHICLE_MODEL = 'airport_firetruck';
const modelNames = [
	PLAYER_VEHICLE_MODEL,
	'vehicle-truck-yellow', 'vehicle-truck-green', 'vehicle-truck-purple', 'vehicle-truck-red',
	'track-straight', 'track-corner', 'track-bump', 'track-finish', 'ramp',
	'decoration-empty', 'decoration-forest', 'decoration-tents', 'wood',
];

const models = {};

async function loadModels() {

	const promises = modelNames.map( ( name ) =>
		new Promise( ( resolve, reject ) => {

			loader.load( `models/${ name }.glb`, ( gltf ) => {

				gltf.scene.traverse( ( child ) => {

					if ( child.isMesh ) {

						child.material.side = THREE.FrontSide;

					}

				} );

				// Vehicle assets are authored in different source scales.
				if ( name === PLAYER_VEHICLE_MODEL ) {

					gltf.scene.scale.setScalar( 0.75 );

				} else if ( name.startsWith( 'vehicle-' ) ) {

					gltf.scene.scale.setScalar( 0.5 );

				}

				models[ name ] = gltf.scene;
				resolve();

			}, undefined, reject );

		} )
	);

	await Promise.all( promises );

}

async function init() {

	registerAll();
	await loadModels();

	const mapParam = new URLSearchParams( window.location.search ).get( 'map' );
	let customCells = null;
	let spawn = null;

	if ( mapParam ) {

		try {

			customCells = decodeCells( mapParam );
			spawn = computeSpawnPosition( customCells );

		} catch ( e ) {

			console.warn( 'Invalid map parameter, using default track' );

		}

	}

	// Compute track bounds and size physics/shadows to fit
	const bounds = computeTrackBounds( customCells );
	const hw = bounds.halfWidth;
	const hd = bounds.halfDepth;
	const groundSize = Math.max( hw, hd ) * 2 + 20;

	const shadowExtent = Math.max( hw, hd ) + 10;
	dirLight.shadow.camera.left = - shadowExtent;
	dirLight.shadow.camera.right = shadowExtent;
	dirLight.shadow.camera.top = shadowExtent;
	dirLight.shadow.camera.bottom = - shadowExtent;
	dirLight.shadow.camera.updateProjectionMatrix();

	scene.fog.near = groundSize * 0.4;
	scene.fog.far = groundSize * 0.8;

	const driveSurfaceRoot = buildTrack( scene, models, customCells );
	rampVisualPieces.length = 0;

	for ( const piece of driveSurfaceRoot.children ) {

		if ( piece.userData.trackKey === 'ramp' ) rampVisualPieces.push( piece );

	}


	const worldSettings = createWorldSettings();
	worldSettings.gravity = [ 0, - 9.81, 0 ];

	const BPL_MOVING = addBroadphaseLayer( worldSettings );
	const BPL_STATIC = addBroadphaseLayer( worldSettings );
	const OL_MOVING = addObjectLayer( worldSettings, BPL_MOVING );
	const OL_STATIC = addObjectLayer( worldSettings, BPL_STATIC );

	enableCollision( worldSettings, OL_MOVING, OL_STATIC );
	enableCollision( worldSettings, OL_MOVING, OL_MOVING );

	const world = createWorld( worldSettings );
	world._OL_MOVING = OL_MOVING;
	world._OL_STATIC = OL_STATIC;

	debugWallGroup.clear();
	const wallProbeBoxes = buildWallColliders( world, null, customCells, GROUP_WALL, GROUP_VEHICLE_COLLIDER );
	buildRampColliders( world, customCells, models.ramp, GROUP_GROUND, GROUND_COLLISION_MASK, debugWallGroup );
	buildTrackObstacleColliders( world, models, customCells, GROUP_WALL, GROUP_VEHICLE_COLLIDER, debugWallGroup );
	const decorationColliderSystem = createDecorationColliderSystem(
		world,
		models,
		customCells,
		GROUP_WALL,
		GROUP_VEHICLE_COLLIDER,
		debugWallGroup
	);
	const groundProbeShape = sphere.create( { radius: GROUND_PROBE_RADIUS } );
	const groundProbeCollector = createClosestCastShapeCollector();
	const groundProbeSettings = createDefaultCastShapeSettings();
	const groundProbeFilter = filter.forWorld( world );
	filter.disableAllLayers( groundProbeFilter, world.settings.layers );
	filter.enableBroadphaseLayer( groundProbeFilter, world.settings.layers, BPL_STATIC );

	for ( const wall of wallProbeBoxes ) {

		const mesh = new THREE.Mesh(
			new THREE.BoxGeometry( wall.halfX * 2, wall.halfY * 2, wall.halfZ * 2 ),
			new THREE.MeshBasicMaterial( {
				color: 0x44ccff,
				wireframe: true,
				transparent: true,
				opacity: 0.45,
				depthWrite: false,
			} )
		);
		mesh.position.set( wall.centerX, wall.centerY, wall.centerZ );
		mesh.rotation.y = wall.angle;
		debugWallGroup.add( mesh );

	}

	const roadHalf = groundSize / 2 * 8;
	rigidBody.create( world, {
		shape: box.create( { halfExtents: [ roadHalf, 0.01, roadHalf ] } ),
		motionType: MotionType.STATIC,
		objectLayer: OL_STATIC,
		position: [ bounds.centerX, - 0.125, bounds.centerZ ],
		friction: 5.0,
		restitution: 0.0,
		collisionGroups: GROUP_GROUND,
		collisionMask: GROUND_COLLISION_MASK,
	} );

	const vehicle = new Vehicle();
	const sphereBody = createSphereBody( world, spawn ? spawn.position : null, GROUP_VEHICLE_SPHERE, GROUP_GROUND );
	vehicle.rigidBody = sphereBody;
	vehicle.physicsWorld = world;

	if ( spawn ) {

		const [ sx, , sz ] = spawn.position;
		const [ , syBody ] = sphereBody.position;
		vehicle.spherePos.set( sx, syBody, sz );
		vehicle.prevModelPos.set( sx, 0, sz );
		vehicle.container.rotation.y = spawn.angle;
		vehicle.heading = spawn.angle;

	}

	decorationColliderSystem?.update( vehicle.spherePos.x, vehicle.spherePos.z );

	const vehicleModel = models[ PLAYER_VEHICLE_MODEL ];
	const vehicleCollision = createVehicleCollisionProfile( vehicleModel );
	const vehicleWallProbe = createVehicleWallProbe( vehicleModel );
	const collisionBodyQuat = new THREE.Quaternion().copy( vehicle.container.quaternion ).multiply( vehicleCollision.alignment );
	debugProbeBox.geometry.dispose();
	debugProbeBox.geometry = vehicleCollision.debugGeometry;
	debugProbeOffset.set(
		vehicleCollision.bodyOffsetX - vehicleCollision.sphereAnchorX,
		vehicleCollision.bodyOffsetY - vehicleCollision.sphereAnchorY,
		vehicleCollision.bodyOffsetZ - vehicleCollision.sphereAnchorZ
	).applyQuaternion( vehicle.container.quaternion );
	const collisionBody = createVehicleCollisionBody(
		world,
		vehicleCollision,
		[
			vehicle.spherePos.x + debugProbeOffset.x,
			vehicle.spherePos.y + debugProbeOffset.y,
			vehicle.spherePos.z + debugProbeOffset.z
		],
		[ collisionBodyQuat.x, collisionBodyQuat.y, collisionBodyQuat.z, collisionBodyQuat.w ],
		GROUP_VEHICLE_COLLIDER,
		VEHICLE_COLLIDER_MASK
	);
	createVehicleCollisionConstraint( world, sphereBody, collisionBody, vehicleCollision );
	vehicle.collisionBody = collisionBody;

	playerVehicleGroup = vehicle.init( vehicleModel );
	playerVehicleGroup.visible = ! debugSphereToggle.checked;
	scene.add( playerVehicleGroup );

	dirLight.target = playerVehicleGroup;

	const cam = new Camera( renderer );
	lookPoint.position.copy( vehicle.spherePos );
	lookPointSmoothedOffset.set( 0, 0, 0 );
	lookPointOffsetVelocity.set( 0, 0, 0 );
	cam.targetPosition.copy( lookPoint.position );

	const controls = new Controls();

	const effects = new Effects( scene );
	const fireSpawnPositions = buildFireSpawnPositions( models, customCells, bounds, spawn );
	const initialFireTargets = fireSpawnPositions.splice( 0, Math.min( INITIAL_FIRE_COUNT, fireSpawnPositions.length ) );
	const fireTargets = new FireTargetSystem( scene, effects, null, initialFireTargets );
	fireTargets.setDebugVisible( debugSphereToggle.checked );
	fireTargetSystem = fireTargets;
	const scorePopups = new ScorePopupSystem( scene );
	const waterPickupPositions = buildWaterPickupPositions( bounds, spawn );
	const waterPickupMaterial = new THREE.MeshStandardMaterial( {
		color: 0x54b8ff,
		emissive: 0x1f7bff,
		emissiveIntensity: 1.6,
		roughness: 0.22,
		metalness: 0.05,
		transparent: true,
		opacity: 0.96,
	} );
	const waterPickupAccentMaterial = new THREE.MeshStandardMaterial( {
		color: 0xc7f4ff,
		emissive: 0x86e8ff,
		emissiveIntensity: 1.8,
		roughness: 0.15,
		metalness: 0.0,
		transparent: true,
		opacity: 0.95,
	} );
	const waterRefillWispGeometry = new THREE.SphereGeometry( 0.12, 10, 8 );
	const waterPickups = waterPickupPositions.map( ( position ) => {

		const group = new THREE.Group();
		const tank = new THREE.Mesh(
			new THREE.CylinderGeometry( 0.34, 0.34, 0.82, 18 ),
			waterPickupMaterial
		);
		tank.castShadow = true;
		tank.receiveShadow = true;
		group.add( tank );

		const band = new THREE.Mesh(
			new THREE.TorusGeometry( 0.28, 0.055, 10, 24 ),
			waterPickupAccentMaterial
		);
		band.rotation.x = Math.PI / 2;
		band.position.y = 0.08;
		group.add( band );

		const topCap = new THREE.Mesh(
			new THREE.CylinderGeometry( 0.18, 0.18, 0.12, 12 ),
			waterPickupAccentMaterial
		);
		topCap.position.y = 0.45;
		group.add( topCap );

		group.position.set( position.x, position.y, position.z );
		scene.add( group );

		return {
			group,
			basePosition: new THREE.Vector3( position.x, position.y, position.z ),
			active: true,
			respawnTimer: 0,
			phase: Math.random() * Math.PI * 2,
		};

	} );
	const refillWisps = [];

	function spawnRefillWisps( origin ) {

		for ( let i = 0; i < WATER_PICKUP_REFILL_WISP_COUNT; i ++ ) {

			const material = new THREE.MeshBasicMaterial( {
				color: i % 3 === 0 ? 0xd9f9ff : 0x55c6ff,
				transparent: true,
				opacity: 0.9,
				depthWrite: false,
			} );
			const mesh = new THREE.Mesh( waterRefillWispGeometry, material );
			const start = origin.clone().add( new THREE.Vector3(
				THREE.MathUtils.randFloatSpread( 0.6 ),
				THREE.MathUtils.randFloat( - 0.1, 0.65 ),
				THREE.MathUtils.randFloatSpread( 0.6 )
			) );
			mesh.position.copy( start );
			scene.add( mesh );
			refillWisps.push( {
				mesh,
				start,
				duration: WATER_PICKUP_REFILL_WISP_TIME + Math.random() * 0.18,
				elapsed: Math.random() * 0.08,
				targetOffset: new THREE.Vector3(
					THREE.MathUtils.randFloatSpread( 0.55 ),
					THREE.MathUtils.randFloat( 0.55, 1.25 ),
					THREE.MathUtils.randFloatSpread( 0.7 )
				),
				arcHeight: THREE.MathUtils.randFloat( 0.35, 0.85 ),
				spin: THREE.MathUtils.randFloatSpread( 7.5 ),
				baseScale: THREE.MathUtils.randFloat( 0.7, 1.15 ),
			} );

		}

	}

	const audio = new GameAudio();
	audio.init( cam.camera );

	const _forward = new THREE.Vector3();
	const _collisionQuat = new THREE.Quaternion();
	let elapsedTime = 0;
	let score = 0;
	let waterAmount = WATER_TANK_CAPACITY;
	let displayedWaterRatio = 1;
	let waterMeterPulse = 0;
	let waterMeterEmptyKick = 0;
	let waterMeterRefillFlash = 0;
	let emptyWaterCooldown = 0;
	let fireSpawnTimer = 0;
	let nextFireSpawnInterval = randomFireSpawnInterval();

	function getCapsuleTiltNormal() {

		capsuleVisualQuat.set(
			collisionBody.quaternion[ 0 ],
			collisionBody.quaternion[ 1 ],
			collisionBody.quaternion[ 2 ],
			collisionBody.quaternion[ 3 ]
		).multiply( vehicleCollision.alignmentInverse );
		capsuleUp.set( 0, 1, 0 ).applyQuaternion( capsuleVisualQuat ).normalize();

		if ( capsuleUp.y < 0 ) capsuleUp.negate();

		return capsuleUp;

	}

	function syncCollisionOrientation() {

		_collisionQuat.copy( vehicle.container.quaternion ).multiply( vehicleCollision.alignment );
		rigidBody.setQuaternion( world, collisionBody, [
			_collisionQuat.x,
			_collisionQuat.y,
			_collisionQuat.z,
			_collisionQuat.w
		], false );
		rigidBody.setAngularVelocity( world, collisionBody, [ 0, 0, 0 ] );

	}

	function syncCollisionPosition( resetMotion = false ) {

		debugProbeOffset.set(
			vehicleCollision.bodyOffsetX - vehicleCollision.sphereAnchorX,
			vehicleCollision.bodyOffsetY - vehicleCollision.sphereAnchorY,
			vehicleCollision.bodyOffsetZ - vehicleCollision.sphereAnchorZ
		).applyQuaternion( vehicle.container.quaternion );
		rigidBody.setPosition( world, collisionBody, [
			vehicle.spherePos.x + debugProbeOffset.x,
			vehicle.spherePos.y + debugProbeOffset.y,
			vehicle.spherePos.z + debugProbeOffset.z
		], false );

		if ( resetMotion ) rigidBody.setLinearVelocity( world, collisionBody, [ 0, 0, 0 ] );
		rigidBody.setAngularVelocity( world, collisionBody, [ 0, 0, 0 ] );

	}

	function castGroundProbeAt( worldPoint ) {

		groundProbeOrigin.copy( worldPoint );
		groundProbeOrigin.y += GROUND_PROBE_START_HEIGHT;

		groundProbeOriginArray[ 0 ] = groundProbeOrigin.x;
		groundProbeOriginArray[ 1 ] = groundProbeOrigin.y;
		groundProbeOriginArray[ 2 ] = groundProbeOrigin.z;
		groundProbeCollector.reset();
		castShape(
			world,
			groundProbeCollector,
			groundProbeSettings,
			groundProbeShape,
			groundProbeOriginArray,
			groundProbeQuatArray,
			groundProbeScaleArray,
			groundProbeDisplacementArray,
			groundProbeFilter
		);

		const hit = groundProbeCollector.hit;
		if ( hit.status !== CastShapeStatus.COLLIDING ) return null;

		const supportY = hit.pointB[ 1 ];
		const distanceToSurface = worldPoint.y - supportY;
		if ( distanceToSurface < - GROUND_SURFACE_OVERLAP_TOLERANCE ) return null;

		return {
			point: new THREE.Vector3( hit.pointB[ 0 ], hit.pointB[ 1 ], hit.pointB[ 2 ] ),
			normal: new THREE.Vector3().fromArray( hit.normal ).normalize(),
			distanceToSurface,
		};

	}

	function averageSupportPoint( supports, predicate, target ) {

		target.set( 0, 0, 0 );
		let count = 0;

		for ( const support of supports ) {

			if ( ! support.isSupported || ! predicate( support ) ) continue;
			target.add( support.contactPoint );
			count ++;

		}

		if ( count > 0 ) target.multiplyScalar( 1 / count );
		return count;

	}

	function computeSupportRigNormal( supports ) {

		supportAverageNormal.set( 0, 0, 0 );
		let supportedCount = 0;

		for ( const support of supports ) {

			if ( ! support.isSupported ) continue;
			supportAverageNormal.add( support.normal );
			supportedCount ++;

		}

		if ( supportedCount === 0 ) return null;

		supportAverageNormal.normalize();

		const frontCount = averageSupportPoint( supports, ( support ) => support.axle === 'front', supportMidA );
		const backCount = averageSupportPoint( supports, ( support ) => support.axle === 'back', supportMidB );
		const leftCount = averageSupportPoint( supports, ( support ) => support.isLeft, groundProbeWorld );
		const rightCount = averageSupportPoint( supports, ( support ) => ! support.isLeft, groundProbeOrigin );

		if ( frontCount > 0 && backCount > 0 && leftCount > 0 && rightCount > 0 ) {

			supportForward.subVectors( supportMidA, supportMidB );
			supportLateral.subVectors( groundProbeOrigin, groundProbeWorld );

			if ( supportForward.lengthSq() > 1e-5 && supportLateral.lengthSq() > 1e-5 ) {

				supportPlaneNormal.crossVectors( supportLateral, supportForward ).normalize();
				if ( supportPlaneNormal.y < 0 ) supportPlaneNormal.negate();
				return supportPlaneNormal.lerp( supportAverageNormal, 0.35 ).normalize().clone();

			}

		}

		return supportAverageNormal.clone();

	}

	function sampleGroundState() {

		const heading = vehicle.heading;
		const halfWidth = Math.max( vehicleCollision.radius * 0.6, 0.28 );
		const halfLength = vehicleCollision.halfHeightOfCylinder + vehicleCollision.radius * 0.5;
		const probePoints = [
			[ 0, 0 ],
			[ halfWidth, halfLength ],
			[ - halfWidth, halfLength ],
			[ halfWidth, - halfLength ],
			[ - halfWidth, - halfLength ],
		];

		groundProbeBase.set( sphereBody.position[ 0 ], sphereBody.position[ 1 ], sphereBody.position[ 2 ] );
		groundProbeForward.set( Math.sin( heading ), 0, Math.cos( heading ) );
		groundProbeRight.set( Math.cos( heading ), 0, - Math.sin( heading ) );
		groundProbeNormal.set( 0, 0, 0 );
		let hitCount = 0;
		let closestDistance = Infinity;

		for ( const [ offsetX, offsetZ ] of probePoints ) {

			groundProbeWorld.copy( groundProbeBase )
				.addScaledVector( groundProbeRight, offsetX )
				.addScaledVector( groundProbeForward, offsetZ );
			const hit = castGroundProbeAt( groundProbeWorld );
			if ( ! hit ) continue;

			const distanceToSurface = hit.distanceToSurface;

			closestDistance = Math.min( closestDistance, Math.max( distanceToSurface, 0 ) );

			if ( distanceToSurface <= GROUND_CONTACT_DISTANCE ) {

				groundProbeNormal.add( hit.normal );
				hitCount ++;

			}

		}

		const wheelSupports = [];
		for ( const wheelProbe of vehicle.getWheelProbePoints() ) {

			const hit = castGroundProbeAt( wheelProbe.worldCenter );
			if ( ! hit ) {

				wheelSupports.push( {
					key: wheelProbe.key,
					axle: wheelProbe.axle,
					isFront: wheelProbe.isFront,
					isLeft: wheelProbe.isLeft,
					isSupported: false,
					contactPoint: null,
					normal: null,
				} );
				continue;

			}

			const wheelToGround = wheelProbe.worldCenter.y - hit.point.y - wheelProbe.radius;
			const isSupported = wheelToGround <= wheelProbe.maxDroop;
			wheelSupports.push( {
				key: wheelProbe.key,
				axle: wheelProbe.axle,
				isFront: wheelProbe.isFront,
				isLeft: wheelProbe.isLeft,
				isSupported,
				contactPoint: isSupported ? hit.point.clone() : null,
				normal: isSupported ? hit.normal.clone() : null,
			} );

		}

		if ( hitCount > 0 ) groundProbeNormal.normalize();
		const supportCount = wheelSupports.filter( ( support ) => support.isSupported ).length;
		const rigNormal = computeSupportRigNormal( wheelSupports ) ?? ( hitCount > 0 ? groundProbeNormal.clone() : null );

		return {
			isGrounded: closestDistance <= GROUND_CONTACT_DISTANCE + GROUND_CONTACT_LENIENCY || supportCount > 0,
			closestDistance,
			normal: rigNormal ?? getCapsuleTiltNormal().clone(),
			supportNormal: hitCount > 0 ? groundProbeNormal.clone() : null,
			supportCount,
			supports: wheelSupports,
		};

	}

	const contactListener = {
		onContactAdded( bodyA, bodyB ) {

			if ( bodyA !== sphereBody && bodyB !== sphereBody && bodyA !== collisionBody && bodyB !== collisionBody ) return;

			_forward.set( 0, 0, 1 ).applyQuaternion( vehicle.container.quaternion );
			_forward.y = 0;
			_forward.normalize();

			const impactVelocity = Math.abs( vehicle.modelVelocity.dot( _forward ) );
			audio.playImpact( impactVelocity );

		}
	};

	const timer = new THREE.Timer();

	function animate() {

		requestAnimationFrame( animate );

		timer.update();
		const dt = Math.min( timer.getDelta(), 1 / 30 );
		elapsedTime += dt;
		emptyWaterCooldown = Math.max( 0, emptyWaterCooldown - dt );

		const input = controls.update();
		cam.camera.getWorldDirection( driveViewForward );
		driveViewForward.projectOnPlane( waterWorldUp ).normalize();
		driveViewRight.set( 1, 0, 0 ).applyQuaternion( cam.camera.quaternion ).projectOnPlane( waterWorldUp ).normalize();

		decorationColliderSystem?.update( sphereBody.position[ 0 ], sphereBody.position[ 2 ] );
		updateWorld( world, contactListener, dt );

		const groundState = sampleGroundState();
		vehicle.update( dt, input, groundState, driveViewForward, driveViewRight );
		syncCollisionOrientation();
		const wallProbeImpactVelocity = resolveVehicleWallProbe( world, vehicle, wallProbeBoxes, vehicleWallProbe );
		if ( wallProbeImpactVelocity > 0 ) {

			syncCollisionPosition();
			audio.playImpact( wallProbeImpactVelocity );

		}
		if ( vehicle.justReset ) {

			syncCollisionPosition( true );
			lookPointSmoothedOffset.set( 0, 0, 0 );
			lookPointOffsetVelocity.set( 0, 0, 0 );

		}
		debugSphere.position.copy( vehicle.spherePos );
		debugSphere.quaternion.set(
			sphereBody.quaternion[ 0 ],
			sphereBody.quaternion[ 1 ],
			sphereBody.quaternion[ 2 ],
			sphereBody.quaternion[ 3 ]
		);
		debugProbeBox.position.set(
			collisionBody.position[ 0 ],
			collisionBody.position[ 1 ],
			collisionBody.position[ 2 ]
		);
		debugProbeBox.quaternion.set(
			collisionBody.quaternion[ 0 ],
			collisionBody.quaternion[ 1 ],
			collisionBody.quaternion[ 2 ],
			collisionBody.quaternion[ 3 ]
		);

		dirLight.position.set(
			vehicle.spherePos.x + 11.4,
			15,
			vehicle.spherePos.z - 5.3
		);

		for ( const pickup of waterPickups ) {

			if ( pickup.active ) {

				pickup.group.visible = true;
				pickup.group.rotation.y += dt * 1.8;
				pickup.group.position.copy( pickup.basePosition );
				pickup.group.position.y += Math.sin( elapsedTime * 2.4 + pickup.phase ) * 0.16;
				const pulse = 0.92 + Math.sin( elapsedTime * 4.8 + pickup.phase ) * 0.08;
				pickup.group.scale.setScalar( pulse );

				if ( pickup.group.position.distanceTo( vehicle.spherePos ) <= WATER_PICKUP_PICKUP_RADIUS ) {

					pickup.active = false;
					pickup.respawnTimer = WATER_PICKUP_RESPAWN_TIME;
					pickup.group.visible = false;
					waterAmount = WATER_TANK_CAPACITY;
					waterMeterRefillFlash = 1.2;
					spawnRefillWisps( pickup.group.position );

				}

			} else {

				pickup.respawnTimer -= dt;
				if ( pickup.respawnTimer <= 0 ) {

					pickup.active = true;
					pickup.group.scale.setScalar( 1 );
					pickup.group.position.copy( pickup.basePosition );

				}

			}

		}

		for ( let i = refillWisps.length - 1; i >= 0; i -- ) {

			const wisp = refillWisps[ i ];
			wisp.elapsed += dt;
			const t = THREE.MathUtils.clamp( wisp.elapsed / wisp.duration, 0, 1 );
			const ease = 1 - Math.pow( 1 - t, 3 );
			_refillBurstTarget.copy( vehicle.spherePos ).add( wisp.targetOffset );
			wisp.mesh.position.lerpVectors( wisp.start, _refillBurstTarget, ease );
			wisp.mesh.position.y += Math.sin( t * Math.PI ) * wisp.arcHeight;
			const scale = wisp.baseScale * ( 1 - t * 0.45 );
			wisp.mesh.scale.setScalar( scale );
			wisp.mesh.rotation.y += wisp.spin * dt;
			wisp.mesh.material.opacity = ( 1 - ease ) * 0.9;

			if ( t >= 1 ) {

				scene.remove( wisp.mesh );
				wisp.mesh.material.dispose();
				refillWisps.splice( i, 1 );

			}

		}

		lookPointOffset.copy( vehicle.modelVelocity ).setY( 0 ).multiplyScalar( LOOK_POINT_SPEED_SCALE );
		springOffset(
			lookPointSmoothedOffset,
			lookPointOffsetVelocity,
			lookPointOffset,
			dt,
			LOOK_POINT_OFFSET_SETTLE,
			LOOK_POINT_DAMPING_RATIO
		);
		if ( lookPointSmoothedOffset.lengthSq() > LOOK_POINT_MAX_DISTANCE * LOOK_POINT_MAX_DISTANCE ) {

			lookPointSmoothedOffset.setLength( LOOK_POINT_MAX_DISTANCE );
			const outwardSpeed = lookPointOffsetVelocity.dot( lookPointSmoothedOffset ) / Math.max( lookPointSmoothedOffset.length(), 1e-5 );
			if ( outwardSpeed > 0 ) {

				lookPointOffsetVelocity.addScaledVector(
					_lookPointNormal.copy( lookPointSmoothedOffset ).normalize(),
					- outwardSpeed
				);

			}

		}
		lookPoint.position.copy( vehicle.spherePos ).add( lookPointSmoothedOffset );

		cam.update( dt, lookPoint.position );
		cam.camera.getWorldDirection( waterViewForward );
		waterViewForward.projectOnPlane( waterWorldUp ).normalize();
		waterViewRight.set( 1, 0, 0 ).applyQuaternion( cam.camera.quaternion ).projectOnPlane( waterWorldUp ).normalize();
		vehicle.updateCannon( dt, input, waterViewForward, waterViewRight );
		let cannonState = vehicle.getCannonState();
		waterAimAssistPoint.copy( cannonState.origin ).addScaledVector( cannonState.direction, WATER_AIM_ASSIST_DISTANCE );
		const aimAssistTarget = fireTargets.getAimAssistTarget( waterAimAssistPoint, WATER_AIM_ASSIST_RADIUS );
		const aimAssistShot = aimAssistTarget ?
			solveAimAssistShot( cannonState.origin, aimAssistTarget.point, cannonState.vehicleVelocity, WATER_SPEED ) :
			null;

		if ( aimAssistShot ) {

			vehicle.setCannonDirection( aimAssistShot.aimDirection );
			cannonState = vehicle.getCannonState();

		}

		debugAimAssistSphere.position.copy( waterAimAssistPoint );
		debugAimAssistSphere.visible = debugSphereToggle.checked;
		let waterState = null;
		let sprayDt = 0;

		if ( input.water && waterAmount > 0 ) {

			sprayDt = Math.min( dt, waterAmount / WATER_DRAIN_PER_SECOND );
			waterAmount = Math.max( 0, waterAmount - sprayDt * WATER_DRAIN_PER_SECOND );
			waterMeterPulse = 1;

		} else if ( input.water && waterAmount <= 0 && emptyWaterCooldown <= 0 ) {

			waterMeterEmptyKick = 1;
			emptyWaterCooldown = 0.22;

		}

		if ( sprayDt > 0 ) {

			if ( aimAssistShot ) waterLaunchVelocity.copy( aimAssistShot.launchVelocity );
			else waterLaunchVelocity.copy( cannonState.direction ).multiplyScalar( WATER_SPEED ).add( cannonState.vehicleVelocity );
			vehicle.applyWaterRecoil( cannonState.direction, sprayDt );
			let targetHit = fireTargets.spray( cannonState.origin, waterLaunchVelocity, WATER_RANGE );
			if ( ! targetHit && aimAssistShot && aimAssistTarget ) {

				targetHit = {
					hit: true,
					target: aimAssistTarget.target,
					impactPoint: aimAssistShot.impactPoint.clone(),
					impactNormal: aimAssistShot.impactNormal.clone(),
					distance: cannonState.origin.distanceTo( aimAssistShot.impactPoint ),
					travelTime: aimAssistShot.travelTime,
				};

			}
			const impact = targetHit || computeFallbackWaterImpact( cannonState.origin, waterLaunchVelocity, WATER_RANGE );

			pendingWaterImpacts.push( {
				remainingTime: impact.travelTime,
				hit: !! targetHit,
				target: targetHit?.target ?? null,
				impactPoint: impact.impactPoint.clone(),
				impactNormal: impact.impactNormal.clone(),
				damageAmount: sprayDt * 0.45,
			} );

			waterState = {
				active: true,
				origin: cannonState.origin,
				direction: cannonState.direction,
				velocity: waterLaunchVelocity.clone(),
			};

		}

		for ( let i = pendingWaterImpacts.length - 1; i >= 0; i -- ) {

			const impact = pendingWaterImpacts[ i ];
			impact.remainingTime -= dt;
			if ( impact.remainingTime > 0 ) continue;

			if ( impact.hit && impact.target ) {

				const result = fireTargets.applyImpact( impact.target, impact.damageAmount );

				if ( result.extinguished ) {

					score += FIRE_EXTINGUISH_SCORE;
					scorePopups.spawn( result.position, `+${ FIRE_EXTINGUISH_SCORE }` );

				}

			}

			effects.emitSplashBurst( impact.impactPoint, impact.impactNormal, impact.hit );
			pendingWaterImpacts.splice( i, 1 );

		}

		if ( fireSpawnPositions.length > 0 && fireTargets.getActiveCount() < MAX_ACTIVE_FIRES ) {

			fireSpawnTimer += dt;

			if ( fireSpawnTimer >= nextFireSpawnInterval ) {

				fireSpawnTimer = 0;
				const nextFire = takeNearbyFireSpawn( fireSpawnPositions, vehicle.spherePos );
				if ( nextFire ) fireTargets.addTarget( nextFire );
				nextFireSpawnInterval = randomFireSpawnInterval();

			}

		} else {

			fireSpawnTimer = 0;
			nextFireSpawnInterval = randomFireSpawnInterval();

		}

		fireTargets.update( dt, elapsedTime );
		effects.update( dt, vehicle, waterState );
		scorePopups.update( dt );
		audio.update( dt, vehicle.linearSpeed, input.z, vehicle.driftIntensity );
		waterMeterPulse = Math.max( 0, waterMeterPulse - dt * 3.2 );
		waterMeterEmptyKick = Math.max( 0, waterMeterEmptyKick - dt * 4.4 );
		waterMeterRefillFlash = Math.max( 0, waterMeterRefillFlash - dt * 2.6 );
		const targetWaterRatio = waterAmount / WATER_TANK_CAPACITY;
		const waterRatioBlend = settleFactor( dt, targetWaterRatio < displayedWaterRatio ? 0.22 : 0.36 );
		displayedWaterRatio = THREE.MathUtils.lerp( displayedWaterRatio, targetWaterRatio, waterRatioBlend );
		const pulseScale = 1 + waterMeterPulse * ( 0.04 + Math.sin( elapsedTime * 16 ) * 0.025 );
		const emptyScale = 1 + waterMeterEmptyKick * 0.14 * Math.sin( elapsedTime * 24 );
		const refillScale = 1 + waterMeterRefillFlash * 0.08;
		const meterScale = Math.max( 0.92, pulseScale * emptyScale * refillScale );
		waterMeterUi.style.transform = `translateX(-50%) scale(${ meterScale })`;
		waterMeterUi.style.boxShadow = waterMeterPulse > 0 || waterMeterRefillFlash > 0
			? '0 10px 28px rgba(0, 0, 0, 0.18), 0 0 26px rgba(86, 216, 255, 0.25)'
			: '0 10px 28px rgba(0, 0, 0, 0.18)';
		waterMeterFill.style.transform = `scaleX(${ THREE.MathUtils.clamp( displayedWaterRatio, 0, 1 ) })`;
		waterMeterFill.style.background = displayedWaterRatio < 0.18
			? 'linear-gradient(90deg, #c7463b 0%, #ff7d64 58%, #ffd0a8 100%)'
			: 'linear-gradient(90deg, #2b89ff 0%, #56d8ff 48%, #d4fbff 100%)';
		waterMeterFill.style.boxShadow = displayedWaterRatio < 0.18
			? '0 0 18px rgba(255, 125, 100, 0.32)'
			: '0 0 18px rgba(86, 216, 255, 0.38)';
		waterMeterLabel.textContent = 'WATER TANK';
		statusUi.textContent = `Score: ${ score }  |  Fires: ${ fireTargets.getActiveCount() }\nDrive: WASD  |  Water: Arrows`;

		renderer.render( scene, cam.camera );

	}

	animate();

}

init();
