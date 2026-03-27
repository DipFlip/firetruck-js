import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createWorldSettings, createWorld, addBroadphaseLayer, addObjectLayer, enableCollision, registerAll, updateWorld, rigidBody, box, sphere, castShape, createClosestCastShapeCollector, createDefaultCastShapeSettings, CastShapeStatus, filter, MotionType } from 'crashcat';
import { Vehicle } from './Vehicle.js';
import { Camera } from './Camera.js';
import { Controls } from './Controls.js';
import { buildTrack, decodeCells, computeSpawnPosition, computeTrackBounds } from './Track.js';
import { buildWallColliders, buildRampColliders, createSphereBody, createVehicleCollisionProfile, createVehicleCollisionBody, createVehicleCollisionConstraint } from './Physics.js';
import { SmokeTrails } from './Particles.js';
import { GameAudio } from './Audio.js';


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
const GROUND_PROBE_RADIUS = 0.05;
const GROUND_SURFACE_OVERLAP_TOLERANCE = 0.12;
const CAPSULE_UPRIGHT_RETURN_RATE_GROUNDED = 6.0;
const CAPSULE_UPRIGHT_RETURN_RATE_AIRBORNE = 10.0;

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
const capsuleVisualQuat = new THREE.Quaternion();
const capsuleTargetVisualQuat = new THREE.Quaternion();
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
const rampVisualPieces = [];

debugSphereToggle.addEventListener( 'change', () => {

	debugSphere.visible = debugSphereToggle.checked;
	debugProbeBox.visible = debugSphereToggle.checked;
	debugWallGroup.visible = debugSphereToggle.checked;
	if ( playerVehicleGroup ) playerVehicleGroup.visible = ! debugSphereToggle.checked;

	for ( const rampPiece of rampVisualPieces ) {

		rampPiece.visible = ! debugSphereToggle.checked;

	}

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
	'decoration-empty', 'decoration-forest', 'decoration-tents',
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

				// Godot imports vehicle models at root_scale=0.5
				if ( name.startsWith( 'vehicle-' ) ) {

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

	const roadHalf = groundSize / 2;
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

	const vehicleModel = models[ PLAYER_VEHICLE_MODEL ];
	const vehicleCollision = createVehicleCollisionProfile( vehicleModel );
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
	cam.targetPosition.copy( vehicle.spherePos );

	const controls = new Controls();

	const particles = new SmokeTrails( scene );

	const audio = new GameAudio();
	audio.init( cam.camera );

	const _forward = new THREE.Vector3();
	const _collisionQuat = new THREE.Quaternion();

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

	function relaxCapsuleOrientation( dt, groundState ) {

		let relaxRate = CAPSULE_UPRIGHT_RETURN_RATE_AIRBORNE;

		if ( groundState?.isGrounded ) {

			const supportY = groundState.supportNormal?.y ?? 1;
			const flatFactor = THREE.MathUtils.clamp( THREE.MathUtils.inverseLerp( 0.94, 0.995, supportY ), 0, 1 );
			relaxRate = CAPSULE_UPRIGHT_RETURN_RATE_GROUNDED * flatFactor;

		}

		if ( relaxRate <= 0 ) return;

		capsuleVisualQuat.set(
			collisionBody.quaternion[ 0 ],
			collisionBody.quaternion[ 1 ],
			collisionBody.quaternion[ 2 ],
			collisionBody.quaternion[ 3 ]
		).multiply( vehicleCollision.alignmentInverse );
		capsuleTargetVisualQuat.setFromAxisAngle( THREE.Object3D.DEFAULT_UP, vehicle.heading );
		capsuleVisualQuat.slerp( capsuleTargetVisualQuat, THREE.MathUtils.clamp( dt * relaxRate, 0, 1 ) );

		_collisionQuat.copy( capsuleVisualQuat ).multiply( vehicleCollision.alignment );
		rigidBody.setQuaternion( world, collisionBody, [
			_collisionQuat.x,
			_collisionQuat.y,
			_collisionQuat.z,
			_collisionQuat.w
		], false );
		rigidBody.setAngularVelocity( world, collisionBody, [ 0, 0, 0 ] );

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
			groundProbeOrigin.copy( groundProbeWorld );
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
			if ( hit.status !== CastShapeStatus.COLLIDING ) continue;

			const supportY = hit.pointB[ 1 ];
			const distanceToSurface = groundProbeBase.y - supportY;
			if ( distanceToSurface < - GROUND_SURFACE_OVERLAP_TOLERANCE ) continue;

			closestDistance = Math.min( closestDistance, Math.max( distanceToSurface, 0 ) );

			if ( distanceToSurface <= GROUND_CONTACT_DISTANCE ) {

				groundProbeNormal.add( groundHitNormal.fromArray( hit.normal ).normalize() );
				hitCount ++;

			}

		}

		if ( hitCount === 0 ) {

			return { isGrounded: false, normal: null };

		}

		groundProbeNormal.normalize();

		return {
			isGrounded: closestDistance <= GROUND_CONTACT_DISTANCE,
			normal: getCapsuleTiltNormal().clone(),
			supportNormal: groundProbeNormal.clone(),
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

		const input = controls.update();

		updateWorld( world, contactListener, dt );

		const groundState = sampleGroundState();
		vehicle.update( dt, input, groundState );
		relaxCapsuleOrientation( dt, groundState );
		if ( vehicle.justReset ) {

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
			rigidBody.setLinearVelocity( world, collisionBody, [ 0, 0, 0 ] );
			rigidBody.setAngularVelocity( world, collisionBody, [ 0, 0, 0 ] );

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

		cam.update( dt, vehicle.spherePos );
		particles.update( dt, vehicle );
		audio.update( dt, vehicle.linearSpeed, input.z, vehicle.driftIntensity );

		renderer.render( scene, cam.camera );

	}

	animate();

}

init();
