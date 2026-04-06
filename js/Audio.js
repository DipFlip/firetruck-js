import * as THREE from 'three';

const ENGINE_VOLUME_SCALE = 0.1;
const ENGINE_STARTUP_RAMP_TIME = 1.1;
const ENGINE_STARTUP_VOLUME_SCALE = 0.01;
const SKID_VOLUME_SCALE = 0.25;
const WATER_FLOW_VOLUME_SCALE = 0.18;
const WATER_REFILL_VOLUME_SCALE = 0.35;
const FIRE_EXTINGUISHED_VOLUME_SCALE = 0.45;
const BURNED_UP_VOLUME_SCALE = 0.4;

function remap( value, inMin, inMax, outMin, outMax ) {

	return outMin + ( outMax - outMin ) * ( ( value - inMin ) / ( inMax - inMin ) );

}

export class GameAudio {

	constructor() {

		this.listener = null;
		this.engineSound = null;
		this.skidSound = null;
		this.waterFlowSound = null;
		this.impactBuffer = null;
		this.waterRefillBuffer = null;
		this.fireExtinguishedBuffer = null;
		this.burnedUpBuffer = null;
		this.carJumpBuffer = null;
		this.carLandBuffer = null;
		this.ready = false;
		this.unlocked = false;
		this.engineStartupRamp = 0;

	}

	init( camera ) {

		this.listener = new THREE.AudioListener();
		camera.add( this.listener );

		const loader = new THREE.AudioLoader();

		this.engineSound = new THREE.Audio( this.listener );
		this.skidSound = new THREE.Audio( this.listener );
		this.waterFlowSound = new THREE.Audio( this.listener );

		loader.load( 'audio/engine.ogg', ( buffer ) => {

			this.engineSound.setBuffer( buffer );
			this.engineSound.setLoop( true );
			this.engineSound.setVolume( 0 );
			this.checkReady();

		} );

		loader.load( 'audio/skid.ogg', ( buffer ) => {

			this.skidSound.setBuffer( buffer );
			this.skidSound.setLoop( true );
			this.skidSound.setVolume( 0 );
			this.checkReady();

		} );

		loader.load( 'audio/impact.ogg', ( buffer ) => {

			this.impactBuffer = buffer;

		} );

		loader.load( 'audio/water_flow.ogg', ( buffer ) => {

			this.waterFlowSound.setBuffer( buffer );
			this.waterFlowSound.setLoop( true );
			this.waterFlowSound.setVolume( 0 );
			this.checkReady();

		} );

		loader.load( 'audio/water_refill.ogg', ( buffer ) => {

			this.waterRefillBuffer = buffer;

		} );

		loader.load( 'audio/fire_extinguished.ogg', ( buffer ) => {

			this.fireExtinguishedBuffer = buffer;

		} );

		loader.load( 'audio/burned_up.ogg', ( buffer ) => {

			this.burnedUpBuffer = buffer;

		} );

		loader.load( 'audio/car_jump.ogg', ( buffer ) => {

			this.carJumpBuffer = buffer;

		} );

		loader.load( 'audio/car_land.ogg', ( buffer ) => {

			this.carLandBuffer = buffer;

		} );

		// Unlock audio context on user interaction
		const unlock = () => {

			if ( this.unlocked ) return;
			this.unlocked = true;

			const ctx = this.listener.context;

			if ( ctx.state === 'suspended' ) {

				ctx.resume();

			}

			this.engineStartupRamp = 0;

			window.removeEventListener( 'keydown', unlock );
			window.removeEventListener( 'click', unlock );
			window.removeEventListener( 'touchstart', unlock );

		};

		window.addEventListener( 'keydown', unlock );
		window.addEventListener( 'click', unlock );
		window.addEventListener( 'touchstart', unlock );

	}

	checkReady() {

		if ( this.engineSound.buffer && this.skidSound.buffer && this.waterFlowSound.buffer ) {

			this.ready = true;

		}

	}

	startSounds() {

		if ( ! this.ready ) return;

		this.engineSound.setVolume( 0 );
		this.skidSound.setVolume( 0 );
		this.waterFlowSound.setVolume( 0 );
		if ( ! this.engineSound.isPlaying ) this.engineSound.play();
		if ( ! this.skidSound.isPlaying ) this.skidSound.play();
		if ( ! this.waterFlowSound.isPlaying ) this.waterFlowSound.play();

	}

	update( dt, speed, throttle, driftIntensity, waterActive = false ) {

		if ( ! this.ready || ! this.unlocked ) return;

		// Do not start looping sounds on the initial unlock click.
		// Start them only once the vehicle is actually asking for audible output.
		const speedFactor = THREE.MathUtils.clamp( Math.abs( speed ), 0, 1 );
		const throttleFactor = THREE.MathUtils.clamp( Math.abs( throttle ), 0, 1 );
		const shouldSkid = driftIntensity > 0.25;
		const shouldWaterFlow = waterActive;

		if ( ! this.engineSound.isPlaying || ! this.skidSound.isPlaying || ! this.waterFlowSound.isPlaying ) {

			if ( speedFactor > 0.01 || throttleFactor > 0.01 || shouldSkid || shouldWaterFlow ) {

				this.engineStartupRamp = 0;
				this.startSounds();

			} else {

				return;

			}

		}

		if ( this.unlocked ) {

			this.engineStartupRamp = Math.min( 1, this.engineStartupRamp + dt / ENGINE_STARTUP_RAMP_TIME );

		}

		// Engine
		const startupBlend = this.engineStartupRamp * this.engineStartupRamp;
		const startupGain = THREE.MathUtils.lerp( ENGINE_STARTUP_VOLUME_SCALE, 1, startupBlend );

		const targetVol = remap( speedFactor + throttleFactor * 0.5, 0, 1.5, 0.05, 0.5 ) * ENGINE_VOLUME_SCALE * startupBlend * startupGain;
		const currentVol = this.engineSound.getVolume();
		this.engineSound.setVolume( THREE.MathUtils.lerp( currentVol, targetVol, dt * 5 ) );

		let targetPitch = remap( speedFactor, 0, 1, 0.5, 3 );
		if ( throttleFactor > 0.1 ) targetPitch += 0.2;
		const currentPitch = this.engineSound.getPlaybackRate();
		this.engineSound.setPlaybackRate( THREE.MathUtils.lerp( currentPitch, targetPitch, dt * 2 ) );

		// Skid
		let skidVol = 0;

		if ( shouldSkid ) {

			skidVol = remap(
				THREE.MathUtils.clamp( driftIntensity, 0.25, 2 ),
				0.25, 2, 0.1, 0.6
			) * SKID_VOLUME_SCALE;

		}

		const curSkidVol = this.skidSound.getVolume();
		this.skidSound.setVolume( THREE.MathUtils.lerp( curSkidVol, skidVol, dt * 10 ) );

		const skidPitch = THREE.MathUtils.clamp( Math.abs( speed ), 1, 3 );
		const curSkidPitch = this.skidSound.getPlaybackRate();
		this.skidSound.setPlaybackRate( THREE.MathUtils.lerp( curSkidPitch, skidPitch, 0.1 ) );

		const targetWaterVol = shouldWaterFlow ? WATER_FLOW_VOLUME_SCALE : 0;
		const currentWaterVol = this.waterFlowSound.getVolume();
		this.waterFlowSound.setVolume( THREE.MathUtils.lerp( currentWaterVol, targetWaterVol, dt * 12 ) );
		this.waterFlowSound.setPlaybackRate( shouldWaterFlow ? 1 : 0.92 );

	}

	playImpact( impactVelocity ) {

		void impactVelocity;

	}

	playWaterRefill() {

		this.playOneShot( this.waterRefillBuffer, WATER_REFILL_VOLUME_SCALE );

	}

	playFireExtinguished() {

		this.playOneShot( this.fireExtinguishedBuffer, FIRE_EXTINGUISHED_VOLUME_SCALE );

	}

	playBurnedUp() {

		this.playOneShot( this.burnedUpBuffer, BURNED_UP_VOLUME_SCALE );

	}

	playCarJump() {

		this.playOneShot( this.carJumpBuffer, 0.35 );

	}

	playCarLand() {

		this.playOneShot( this.carLandBuffer, 0.4 );

	}

	playOneShot( buffer, volume ) {

		if ( ! this.unlocked || ! buffer ) return;

		const sound = new THREE.Audio( this.listener );
		sound.setBuffer( buffer );
		sound.setVolume( volume );
		sound.play();

	}

}
