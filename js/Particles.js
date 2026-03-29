import * as THREE from 'three';

const SKID_POOL_SIZE = 64;
const WATER_POOL_SIZE = 260;
const SPLASH_POOL_SIZE = 96;
const EXTINGUISH_POOL_SIZE = 64;

const _jitter = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _bitangent = new THREE.Vector3();
const _up = new THREE.Vector3( 0, 1, 0 );

function createRadialTexture( innerColor, midColor, outerColor ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = 64;
	canvas.height = 64;

	const ctx = canvas.getContext( '2d' );
	const gradient = ctx.createRadialGradient( 32, 32, 4, 32, 32, 30 );
	gradient.addColorStop( 0.0, innerColor );
	gradient.addColorStop( 0.45, midColor );
	gradient.addColorStop( 1.0, outerColor );

	ctx.fillStyle = gradient;
	ctx.fillRect( 0, 0, 64, 64 );

	const texture = new THREE.CanvasTexture( canvas );
	texture.needsUpdate = true;
	return texture;

}

function createPool( scene, count, materialFactory, defaultScale ) {

	const particles = [];

	for ( let i = 0; i < count; i ++ ) {

		const sprite = new THREE.Sprite( materialFactory() );
		sprite.visible = false;
		sprite.scale.setScalar( defaultScale );
		scene.add( sprite );

		particles.push( {
			sprite,
			life: 0,
			maxLife: 0,
			velocity: new THREE.Vector3(),
			startScale: defaultScale,
			endScale: defaultScale,
			startOpacity: 0,
			endOpacity: 0,
			damping: 0,
			gravity: 0,
			alphaMode: 'fade',
		} );

	}

	return particles;

}

function updatePool( pool, dt ) {

	for ( const particle of pool ) {

		if ( particle.life <= 0 ) continue;

		particle.life -= dt;

		if ( particle.life <= 0 ) {

			particle.sprite.visible = false;
			continue;

		}

		const t = 1 - particle.life / particle.maxLife;
		const dampingFactor = Math.max( 0, 1 - particle.damping * dt );

		particle.velocity.multiplyScalar( dampingFactor );
		particle.velocity.y -= particle.gravity * dt;
		particle.sprite.position.addScaledVector( particle.velocity, dt );

		let opacity = THREE.MathUtils.lerp( particle.startOpacity, particle.endOpacity, t );
		if ( particle.alphaMode === 'triangle' ) opacity *= t < 0.5 ? t * 2 : ( 1 - t ) * 2;
		particle.sprite.material.opacity = opacity;

		const scale = THREE.MathUtils.lerp( particle.startScale, particle.endScale, t );
		particle.sprite.scale.setScalar( scale );

	}

}

export class Effects {

	constructor( scene ) {

		this.skidParticles = [];
		this.waterParticles = [];
		this.splashParticles = [];
		this.extinguishParticles = [];

		const smokeMap = new THREE.TextureLoader().load( 'sprites/smoke.png' );
		const waterMap = createRadialTexture( 'rgba(255,255,255,0.95)', 'rgba(140,220,255,0.7)', 'rgba(140,220,255,0)' );
		const splashMap = createRadialTexture( 'rgba(255,255,255,0.9)', 'rgba(190,235,255,0.55)', 'rgba(190,235,255,0)' );

		this.skidParticles = createPool( scene, SKID_POOL_SIZE, () => new THREE.SpriteMaterial( {
			map: smokeMap,
			transparent: true,
			depthWrite: false,
			opacity: 0,
			color: 0x5e5f6b,
		} ), 0.25 );

		this.waterParticles = createPool( scene, WATER_POOL_SIZE, () => new THREE.SpriteMaterial( {
			map: waterMap,
			transparent: true,
			depthWrite: false,
			opacity: 0,
			color: 0xb8f4ff,
			blending: THREE.AdditiveBlending,
		} ), 0.1 );

		this.splashParticles = createPool( scene, SPLASH_POOL_SIZE, () => new THREE.SpriteMaterial( {
			map: splashMap,
			transparent: true,
			depthWrite: false,
			opacity: 0,
			color: 0xd7f6ff,
			blending: THREE.AdditiveBlending,
		} ), 0.12 );

		this.extinguishParticles = createPool( scene, EXTINGUISH_POOL_SIZE, () => new THREE.SpriteMaterial( {
			map: smokeMap,
			transparent: true,
			depthWrite: false,
			opacity: 0,
			color: 0x80848f,
		} ), 0.35 );

		this.skidEmitIndex = 0;
		this.waterEmitIndex = 0;
		this.splashEmitIndex = 0;
		this.extinguishEmitIndex = 0;
		this.waterAccumulator = 0;

	}

	update( dt, vehicle, waterState = null ) {

		const shouldEmitSkid = vehicle.driftIntensity > 0.25 && vehicle.colliding;

		if ( shouldEmitSkid ) {

			if ( vehicle.wheelBL ) this.emitSkidAtWheel( vehicle.wheelBL, vehicle );
			if ( vehicle.wheelBR ) this.emitSkidAtWheel( vehicle.wheelBR, vehicle );

		}

		if ( waterState?.active ) {

			this.waterAccumulator += dt * 240;

			while ( this.waterAccumulator >= 1 ) {

				this.emitWaterParticle( waterState.origin, waterState.velocity || waterState.direction );
				this.waterAccumulator -= 1;

			}

		} else {

			this.waterAccumulator = 0;

		}

		updatePool( this.skidParticles, dt );
		updatePool( this.waterParticles, dt );
		updatePool( this.splashParticles, dt );
		updatePool( this.extinguishParticles, dt );

	}

	emitSkidAtWheel( wheel, vehicle ) {

		const particle = this.skidParticles[ this.skidEmitIndex ];
		this.skidEmitIndex = ( this.skidEmitIndex + 1 ) % this.skidParticles.length;

		wheel.getWorldPosition( particle.sprite.position );
		particle.sprite.position.y = vehicle.container.position.y + 0.05;
		particle.sprite.visible = true;

		particle.startScale = 0.14 + Math.random() * 0.12;
		particle.endScale = particle.startScale * 1.9;
		particle.startOpacity = 0.7;
		particle.endOpacity = 0.1;
		particle.velocity.set(
			( Math.random() - 0.5 ) * 0.2,
			Math.random() * 0.1,
			( Math.random() - 0.5 ) * 0.2
		);
		particle.maxLife = 0.5;
		particle.life = particle.maxLife;
		particle.damping = 1.0;
		particle.gravity = 0;
		particle.alphaMode = 'triangle';

	}

	emitWaterParticle( origin, velocity ) {

		const particle = this.waterParticles[ this.waterEmitIndex ];
		this.waterEmitIndex = ( this.waterEmitIndex + 1 ) % this.waterParticles.length;

		_jitter.set(
			( Math.random() - 0.5 ) * 0.09,
			( Math.random() - 0.5 ) * 0.09,
			( Math.random() - 0.5 ) * 0.09
		);

		particle.sprite.position.copy( origin ).add( _jitter );
		particle.sprite.visible = true;
		particle.startScale = 0.11 + Math.random() * 0.06;
		particle.endScale = 0.045;
		particle.startOpacity = 1.0;
		particle.endOpacity = 0.12;
		particle.velocity.copy( velocity ).add( _jitter.multiplyScalar( 14 ) );
		particle.maxLife = 0.46 + Math.random() * 0.16;
		particle.life = particle.maxLife;
		particle.damping = 0.45;
		particle.gravity = 18.0;
		particle.alphaMode = 'fade';

	}

	emitSplashParticle( point, normal ) {

		const particle = this.splashParticles[ this.splashEmitIndex ];
		this.splashEmitIndex = ( this.splashEmitIndex + 1 ) % this.splashParticles.length;

		_tangent.crossVectors( normal, Math.abs( normal.y ) > 0.9 ? new THREE.Vector3( 1, 0, 0 ) : _up ).normalize();
		_bitangent.crossVectors( normal, _tangent ).normalize();
		_jitter.copy( normal ).multiplyScalar( 0.5 + Math.random() * 1.0 )
			.addScaledVector( _tangent, ( Math.random() - 0.5 ) * 2.8 )
			.addScaledVector( _bitangent, ( Math.random() - 0.5 ) * 2.8 );

		particle.sprite.position.copy( point )
			.addScaledVector( _tangent, ( Math.random() - 0.5 ) * 0.45 )
			.addScaledVector( _bitangent, ( Math.random() - 0.5 ) * 0.45 );
		particle.sprite.visible = true;
		particle.startScale = 0.1 + Math.random() * 0.12;
		particle.endScale = 0.02;
		particle.startOpacity = 0.24;
		particle.endOpacity = 0.0;
		particle.velocity.copy( _jitter );
		particle.maxLife = 0.24 + Math.random() * 0.22;
		particle.life = particle.maxLife;
		particle.damping = 1.8;
		particle.gravity = 6.5;
		particle.alphaMode = 'fade';

	}

	emitSplashBurst( point, normal, hit = false ) {

		const count = hit ? 6 : 4;

		for ( let i = 0; i < count; i ++ ) {

			this.emitSplashParticle( point, normal );

		}

	}

	emitExtinguishSmoke( position, amount = 16 ) {

		for ( let i = 0; i < amount; i ++ ) {

			const particle = this.extinguishParticles[ this.extinguishEmitIndex ];
			this.extinguishEmitIndex = ( this.extinguishEmitIndex + 1 ) % this.extinguishParticles.length;

			particle.sprite.position.copy( position ).add( new THREE.Vector3(
				( Math.random() - 0.5 ) * 0.9,
				Math.random() * 0.45,
				( Math.random() - 0.5 ) * 0.9
			) );
			particle.sprite.visible = true;
			particle.startScale = 0.25 + Math.random() * 0.15;
			particle.endScale = particle.startScale * ( 2.4 + Math.random() * 0.8 );
			particle.startOpacity = 0.7;
			particle.endOpacity = 0.0;
			particle.velocity.set(
				( Math.random() - 0.5 ) * 0.7,
				1.1 + Math.random() * 1.2,
				( Math.random() - 0.5 ) * 0.7
			);
			particle.maxLife = 1.0 + Math.random() * 0.8;
			particle.life = particle.maxLife;
			particle.damping = 0.55;
			particle.gravity = - 0.2;
			particle.alphaMode = 'fade';

		}

	}

	emitHitSmoke( position ) {

		const particle = this.extinguishParticles[ this.extinguishEmitIndex ];
		this.extinguishEmitIndex = ( this.extinguishEmitIndex + 1 ) % this.extinguishParticles.length;

		particle.sprite.position.copy( position ).add( new THREE.Vector3(
			( Math.random() - 0.5 ) * 0.9,
			Math.random() * 0.45,
			( Math.random() - 0.5 ) * 0.9
		) );
		particle.sprite.visible = true;
		particle.startScale = 0.25 + Math.random() * 0.15;
		particle.endScale = particle.startScale * ( 2.4 + Math.random() * 0.8 );
		particle.startOpacity = 0.7;
		particle.endOpacity = 0.0;
		particle.velocity.set(
			( Math.random() - 0.5 ) * 0.7,
			1.1 + Math.random() * 1.2,
			( Math.random() - 0.5 ) * 0.7
		);
		particle.maxLife = 1.0 + Math.random() * 0.8;
		particle.life = particle.maxLife;
		particle.damping = 0.55;
		particle.gravity = - 0.2;
		particle.alphaMode = 'fade';

	}
}
